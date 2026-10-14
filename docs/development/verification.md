# Browser verification and test selection

Read [CLAUDE.md](../../CLAUDE.md) first for shared workflow rules. Paths in code spans and module maps are relative to the repository root.

Related: [local-development](local-development.md), [performance](performance.md).
HUD layout only (#707, #716): `PLAYWRIGHT_MODULE=/path/to/playwright node tools/hudlayouttest.cjs http://localhost:8000 /tmp/hud-shots` checks the real index DOM, styles and icon initializer at 844×390, 667×375, 932×430, 568×320 and 1280×720 with zero, symmetric and asymmetric safe insets. It checks the exact 4 px safe-area edge placement (#766), shared shells, score/shortcut cells, score hierarchy, icon accessibility, compass height/top equal to the badges with a 4 px gap beside the right badge (#767), unclipped compact data/cardinal text, adjunct/control overlap, lives 12 px below the actual compass with real Combat hurt/life updates and weapon-dependent visibility (full unarmed hidden, injured unarmed visible even offline, full armed combat visible), disabled state and blur fallback. #970 also checks clock-over-weather geometry, the continuous divider, seven actual weather icons and −123°/100° updates using the unchanged main.js update fragment; clock/weather remain independent. Presence uses its real constructor with networking disabled. It suppresses game bootstrap; its screenshots are HUD-only, not game-render or gameplay evidence. `CHROME_PATH` optionally selects Chrome.

Armed greeting priority (#872): `PLAYWRIGHT_MODULE=/path/to/playwright node tools/armedgreettest.cjs http://localhost:8867 /tmp/armed-greet` runs complete verbatim main.js production functions/listener bodies with current weapon checks, actual index DOM/THREE/Ghosts and source identity checks. It covers unarmed greeting, close armed touch, old ghost focus after weapon changes, E/keyup and pointer release (no latched rifle), primary mouse, suit/web/jetpack and preserved ordinary object E. Bootstrap/WebGL are suppressed; world collaborators and weapon effects are stand-ins, so the screenshot certifies action-label DOM rather than an actual-world shot/physical phone. No baseline or assertions are relaxed.

## Three-box head verification (#974)

`node tools/headboxestest.cjs` checks ordinary shared geometry and invalid inputs.
`node --test cloudflare/headboxes.test.mjs cloudflare/players.test.mjs` checks actual
PlayerRoom damage/recovery/kill semantics and retains cached-v1 coverage. Unknown
contact-version fixtures use version 9 now that version 2 is published.
`PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/headboxesbrowsertest.cjs game worker output`
uses actual Ghosts/Combat and a local Worker in two browser peers, suppressing only
apartment bootstrap. Its Avatar/box picture renders real geometry in a small debug
scene. It does not certify the apartment, mobile stability or rendering performance.
Existing polygon certificates are historical v1 evidence, not requirements for v2.

`PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/straightheadtest.cjs game worker output`
checks #893 using actual native Ghosts/Combat/Avatar meshes and two local PlayerRoom
WebSockets, with bootstrap/WebGL blocked. Wand/web/saber cover head/body, genuine
body-before-head, miss and wall; saber also keeps its cone. Jetpack covers its actual
update-triggered downward flame, offset body contact, footprint miss and no head
bonus through a native wall. Its pre-existing volume/body fallback through a wall
is separately recorded, not accepted as obstacle-safe gameplay. One lethal head
receipt checks unchanged points, kill UUID/reset and receipt replay. Original HUD
screenshots are DOM evidence, not World/game-render/phone/FPS evidence. Start the
isolated services with `python3 tools/devserve.py 8870 .` and `node cloudflare/dev.mjs
8871`. The Node fake-runtime suite is `node --test cloudflare/headboxes.test.mjs`.

#893 publication `44aaf5940111b1332aa123515dad0784b9a7a0e1`, grouped head-hits776:
post-Nerf-rebase native5 passed81/81 actualCLI0, final shared Node53/53CLI0.
Every one of260 publication hashes matches the commit; all older changelog bytes
remain exact. All runtime/driver bytes measured in native5 are unchanged; the only
later incoming frozen-path difference was a Nerf Node fixture, rerun in final53.
A separately archived exact pre-893 ae64de9 Worker (253 git-blob-verified source
files) passed5/5 actualCLI0 with the new native client's v2 straight contact
remaining body1/HP9. Ordinary no-hc packets for all four weapons, false head claims,
origin/rate limits and shared recovery/lethal/replay behavior pass Node. Actual
head/body/legacy DOM PNGs were opened; no apartment, GPU or phone was exercised.
Worker38540493118/job115773736687 executed genuine wrangler deploy at09:11:37Z,
Uploaded/Deployed09:11:41Z; Pages38540492744/job115773735256 executed deploy-pages
for that exact SHA and reported success09:11:37Z,2026-10-14. This is publication,
not live-device acceptance. Existing jetpack body-wall bug is #978: independently
archived7c2dd25 Combat reproduces it with5 checks/CLI0; no head bonus crosses the
wall. Artifacts/frozen producers and original failures remain in
`/tmp/lunden-priority-893` and the orchestration run directory. Native1's64-check
run had4 fixture failures; native2's73/73 receipt run had loading-covered PNGs;
native3's81-check run had one expired marker capture. Early capture after the
actual receipt fixes only the fixture timing. The initial legacy temporary producer
failed syntax before connecting; both its CLI1 and the corrected5/5CLI0 are retained.



## Bow arrow-tip head damage (#979)

`node --test cloudflare/bowhead.test.mjs` checks the shared native step, falling tip
path/range/lifetime, first-body head rejection and actual PlayerRoom 2/1 damage,
cached packets, forged head/origin/rate limits, recovery and one lethal UUID/reset.
Run `PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/bowheadtest.cjs GAME WORKER OUT`
with an isolated devserve/local Node Worker. It uses real Bow draw/release/onShot,
Arrows, Ghosts/Combat, two actual WS clients and native DOM/Three meshes; bootstrap
and WebGL are blocked. It checks real head/body/miss/wall/floor, the arrow class's
physical sticking, a falling10m path whose straight launch ray misses the head,
unchanged near/distance points, lethal/reset/replay and visible original HUD images.
`--legacy` selects one actual new-client head claim against an independently served
previous Worker, expected body1. The independent frozen7759da7 Bow/Arrows reference
is loaded directly from git: actual render-step positions and velocities match at
16.7/20ms, and draw/release/solid-world methods remain source-identical. This confirms
representative preserved physics, not all-frame-time parity of the fixed20ms
predictor or full World/GPU/physical-phone performance.

#979 runtime published as `e97db01a5efc65815d050c22091608948ea2ded9`, head-hits780.
Native2 passed46/46 actualCLI0; a separately frozen a40a26c Worker with253 source
files verified against exact git blobs passed11/11CLI0 with the new real Bow
client (v2 hc remains body1/HP9). Both gameplay and legacy original HUD images were
opened and inspected. All257 measured source/driver hashes stayed exact through
last rebase; all263 publication hashes match that commit and older changelog bytes
are unchanged. Node: initial broad57/57CLI0; final broad56/57CLI1 retains the known
appearance-dependent old v1 lateral-greeting assertion #945 at players.test.mjs657.
Targeted Bow/shared-box/Nerf tests passed11/11CLI0. No broad retry or anatomical fix
hides that unrelated failure. Native1's46-check run retained one fixture CLI1:
an actual tilted28m/s vector has Float64 length27.999999999999996; replacing strict
28 equality with a small numeric comparison changed no product behavior.
Worker38543751769/job115784601223 executed real `npx wrangler deploy`09:38:16Z,
Uploaded09:38:19Z/Deployed09:38:20Z2026-10-14, version
0b7bac71-ed58-49b0-a04f-4eb9b1d80941. Pages38543751944/job115784603640 used the same
exact SHA and actual deploy-pages, reporting success09:38:19Z. This proves publication,
not live-device gameplay. Full source freezes/owners/producers/PNGs/original failures
and deploy logs are retained in `/tmp/lunden-priority-979` and orchestration artifacts.
Only #979 is complete; ball #980 and parents #895/#874 are separate.

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
tools/nerfreciprocaltest.cjs (#715): two actual native Ghosts/Combat/held Nerf clients and local Worker sockets,
                       18 checks: two shots each, authoritative reciprocal receipts/lives, remote darts, cadence and real p/q.
                       --apartment substitutes one ordinary World for one native peer; support/headroom/native segment preflight,
                       two final draws/one bounded CDP image only after actual confirmations. Current World attempt is CLI 1:
                       first pending shot becomes targetless after 2002ms; logic/image incomplete, no reciprocal World acceptance.
                       Future failures record actual muzzle and production lastPath; those fields were absent from that World run.
                       --first-shot-only: one real use/send with immediate Node checkpoint of actual public candidate points,
                       muzzle/completed lastPath/cache, then bounded independent native arc; no HP wait/rounds/image required.
                       Pre/post-remedy actual diagnostic CLI 0 validates capture; both still deadline/cache with no gameplay hit.
                       Source checkpoints/actual exits retained;
                       see docs/validation/issue-715/README.md.
tools/cachephasetest.cjs / .html (#715): actual buildWorld(plan)+main Garage/Core/CoreHouse/Player/Detail component,
                       zero WebGL, native 2s query with recorded real short arc; passive promoted scan/spatial/occurrence
                       checkpoint before largest unfinished geometry serialization (16MiB cap) and isolated replay.
                       Post-outcome bounded independent full-position scans and native Detail-call provenance distinguish
                       finite-arc overlap from unknown authored boxes. Queued-only fresh-bound reuse compares unchanged2cbc250
                       exact completed buffer bytes/operation counts and mutation/fallback guards.
                       Unchanged 84c268e/native parity traps for undersized authored boxes beyondfar/behindnear, singular,
                       missing/invalid/empty boxes, custom/instanced/skinned/material/layers. No full-main/phone identity claim.
tools/cachewaittest.cjs / .html (#715): unchanged 4b2a75e reference versus candidate wait re-pruning;
                       controlled builder callbacks, actual query clocks, independent native arcs, shared/transform/floor,
                       membership/version/dispose/cancel, concurrent urgency and real dispose immediately after early drop.
                       Test-only cache state/operation observation and after-drop lifecycle hook; no production hook/WebGL.
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

#900 source/native step: a non-repository diagnostic `/tmp/lunden-priority-900/probe.cjs` executes the complete current main driver-init span and whole `use` function verbatim in real index DOM, with actual Car, Greetings, OlofDriver and Avatar, without bootstrap/WebGL. It completed 26 PASS, actual Node exit 0 and no page errors: native arrival, greeting/once-per-arrival scoring, saved parked/arriving/leaving restoration, garage seat release, independent pre-change driver/Avatar geometry and bone-pose parity. Shared figure/skeleton/IK/pose prefix and driver implementation remain byte-identical except descriptive comments. The first 22-check attempt passed assertions but exited 1 on diagnostic circular-result serialization; the corrected final run is separate. Its result image is a text-only native summary, not rendered gameplay. At that intermediate source step, actual full-app verification was pending; completion follows below.

#900 actual app acceptance on b7f1e29: the corrected finite diagnostic completed 20 PASS, zero FAIL/page errors and actual Node/wrapper exit 0 in 24.487 s (monitor elapsed wall, not a performance benchmark). At 480×300 with `?shot&quality=0&mp=0&time=12&month=6&car&olof=0`, genuine warm completion and hidden loading/menu were reached using the ordinary loop before pausing automatic renders. Original World/furniture/culling remained; real app updates, legacy-query inertness/free seats, driver greeting/score and parked save/load passed. The inspected actual car image shows Olof behind the wheel; head NDC, camera layers and every ancestor through the scene were visible without overrides. Final manual render used gl.finish; results and all 1,311 unchanged tracked-file hashes were saved before capture. Attempt 1 exited 1 in 49.586 s before assertions: its probe tried clicking #start-touch even though the valid shot query intentionally hides its overlay; that harness error is retained separately and is not product/startup evidence. Artifacts and immutable attempt copies: `/tmp/lunden-priority-900/attempt-{1,2}/`; persistent summary: `~/.local/state/lunden-orkester/20261013-priority/900-proof.json`. No physical-phone/FPS/network acceptance is claimed, and complete resttest/nonpctest/olofcartest HTML suites were not rerun. Owned driver/Chromium/server processes were stopped.

Final #900 rebase preserved incoming #902 compact-HUD CSS correction. Against the app freeze, exactly four existing paths differ: `data/changelog.json`, `docs/development/interactions.md`, `docs/development/verification.md` and `src/hudicons.css`; four new #902 validation documentation/image files are also preserved. All driver/world/Avatar/main/config/index paths and other tracked paths remain byte-identical; this is not an all-source match. The corrected HUD style was executed in a final 26-PASS native repeat (actual exit 0, no errors/WebGL). The full-app car image remains evidence for the frozen b7f1e29 run; it was not rerun after this HUD-only style change.

### Compact HUD text acceptance (#902)

The unchanged published #896 `hudlayouttest.cjs` now completes all 15 viewport/inset cases with
zero errors and CLI 0. Compact temp/clock/score client/scroll widths are 39/39,39/39,71/71,
respectively, at 568×320/safe 44. Original `fpstest.cjs` native 47 assertions also pass/CLI 0;
actual Presence values 0/9/60/144/— and count 99 fit the compact lower FPS row without glyph
overlap. No fixture assertion/value, JavaScript runtime or >600px layout was changed.
See [proof and reviewed pictures](../validation/issue-902/README.md). These are native DOM/Combat
checks with bootstrap suppressed, not WebGL, actual device FPS or physical-phone acceptance.
The independently reproduced 7px lives/head-hit-text overlap remains #904 and was not fixed here.
#900 source/native step: a non-repository diagnostic `/tmp/lunden-priority-900/probe.cjs` executes the complete current main driver-init span and whole `use` function verbatim in real index DOM, with actual Car, Greetings, OlofDriver and Avatar, without bootstrap/WebGL. It completed 26 PASS, actual Node exit 0 and no page errors: native arrival, greeting/once-per-arrival scoring, saved parked/arriving/leaving restoration, garage seat release, independent pre-change driver/Avatar geometry and bone-pose parity. Shared figure/skeleton/IK/pose prefix and driver implementation remain byte-identical except descriptive comments. The first 22-check attempt passed assertions but exited 1 on diagnostic circular-result serialization; the corrected final run is separate. Its result image is a text-only native summary, not rendered gameplay. Actual full-app verification is still pending an exclusive run.


### Confirmed marker/lives clearance (#904)

`tools/fpstest.cjs` retains all original47 counter/Presence/badge/reticle checks, adds12 actual marker/lives viewport/inset checks and6 event-placement regressions: named clearance,100 Combat updates with zero marker geometry reads, a real mouse click through the relocated card, resize recentering, clear and Combat reset. Final65 PASS/Node exit0, no pageerrors. Run with the usual PLAYWRIGHT_MODULE/CHROME_PATH, base URL and output path. For the diagnostic baseline, pass `BASELINE_MARKER=/path/to/frozen-before-hitmarker.js` and `--baseline-marker`;59 checks verify the old two positive-top-inset overlaps, not accepted layout.

The centered vertical CSS diagnostics on actual568×320 index/Combat/Presence gave a4px reticle gap below lives (violating the retained20px requirement), or score-badge overlap above lives. Final event-only placement shifts the card only when real rectangles overlap; other centered cards remain clear. Before/after safe44/44/20/20 PNGs were inspected at `/tmp/lunden-marker904-surface/{before,after}/marker-safe-568.png`. Relevant source hashes/frozen baseline and vertical diagnostic JSON/PNGs are retained there. The existing actual local Worker→Ghosts→Combat receipt driver also passed16 checks/Node exit0, including timing, expiry with paused logic, reset, score/audio and actual shooting-button clicks. This is native DOM/socket evidence without apartment bootstrap/WebGL or a physical-phone claim.


Bow grip component (#910): `PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/bowgriptest.cjs http://localhost:8878 /tmp/bow-grip` tests actual Bow/Hand/Arrows/dynbox with bootstrap/WebGL suppressed and complete verbatim main keyboard/mouse/touch dispatch bodies. Default assertions require explicit centered contact; `--baseline` is an explicit old-source diagnostic, not candidate acceptance. The fixed reference is published 79a5749 Bow, loaded independently from git; origin/ray methods and whole held-model matrices are compared. `--render` requires the shared exclusive graphics slot and draws four actual first-person component states (slack/full/released/moved) at 480×300/FOV72, with plain lighting/background, no apartment. It saves raw results/source hashes before PNGs and guards camera projection/layers/ancestry; no phone or full-world claim follows.

#910 intermediate evidence: original component render completed 26 PASS/actual Node and wrapper exit 0 in 1.469 s; all four inspected images show the hand on the lower limb, below the leather grip. Original Hand.gripOf selects model-local [-0.00213,-0.2812,-0.14588], 0.29678 model units from the leather centre (held scale0.6); this is modeled contact geometry, not an anatomical measurement. The minimal Bow/config grip candidate completes 29 native PASS/actual exit 0 with contact at the leather centre across all four states, unchanged independent reference firing/ray implementation and exact slack/full whole-model matrices. Hand, bow held transform, string/arrow, physics and home/placement paths are unchanged. The first strict Euler-cant equality assertion failed due to quaternion/Euler rounding and is retained separately; the corrected geometric check uses 1e-12 tolerance. At this intermediate native step, candidate after-images were pending; the actual component completion follows below. Artifacts `/tmp/lunden-priority-910/`.

#910 after-component acceptance: 32 PASS, zero FAIL/page errors, actual Node and monitor exit 0 in 1.219 s. All four 480×300/FOV72 images were inspected: the hand now closes at the modeled dark leather middle grip at rest, full pull, release and the moved/turned camera. Every paired before/after whole held-model matrix, string coordinates, nocked-arrow coordinates and visibility flag is exactly equal; only hand contact/curl changes. Before render was 26 PASS/exit 0 in 1.469 s. Renderer guards preserve original projection/layers and ancestry; gl.finish/results/source hashes precede captures and all eight tested source paths remain unchanged during each run. This is component rendering with plain background/lighting, not the apartment, physical device, network or persisted-save/reload acceptance; actual placement/dynbox home methods are checked natively and the unchanged firing/raycast paths are compared with independently loaded published 79a5749 Bow. Owned monitor/Node/Chromium/server processes were stopped. Source/result/image provenance: `/tmp/lunden-priority-910/{before-render,after-render}/`, `*-exit.json`, and `~/.local/state/lunden-orkester/20261013-priority/910-proof.json`.

Final #910 rebase preserved #904 combat hit-marker configuration. Of eight recorded component source paths, only `src/config.js` differs, solely in unrelated hit-marker settings; BOW/HAND and all held-model/firing/hand/dispatch bytes remain unchanged. A final native repeat completed 29 PASS, actual exit 0, no errors/WebGL on the rebased checkout. No further render run was made. Published source step: 06dae34; final proof is path-specific rather than an all-source match.

## Original-speed car protection (#915)

Start a private devserve, then `PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/carsafetytest.cjs BASE OUTPUT`.
This loads actual Car/Player/GarageDoor/OlofDriver with real garage inside/terrain queries; the minimal controlled World only supplies Player's
existing constructor collaborators. No apartment or WebGL. Player is stationary on the exact actual route at20m; simulation uses1/60s steps.
Checks cover stop/hold/resume, vertical/lateral/near-behind exclusions, reverse garage, closed/actual-opening GarageDoor, unchanged clear timings,
parking/braking, existing save/load including null default-garage sentinel, driver/passenger seats, greeting and close-before-departure.
For the before control use `--baseline-car /path/to/frozen-original-car.js`; its condition explicitly checks crossing, not successful protection.
The failure's original Car bytes match1b188d3/59d8689. Baseline24 checks and final26 checks passed with actual CLI0/no page errors/zeroWebGL.
At original8/3/brake2, center separation changes0.025m/no stop→6.5216277m with a stop at3.0666667 simulated seconds, route distance13.4391667.
Stationary hold stays exactly stopped; moving the actual Player away releases it. Exact path/timing/park records match: clear street15.75s and
full garage62.1333333s. These are controller-simulation observations, not CPU/GPU/FPS or physical-driver measurements.
Artifacts `/tmp/lunden-car915-surface/{baseline,final2}` include rawJSON/source hashes, actual exits and inspected text-only nativePNG; they are not
rendered gameplay pictures. The first candidate allowed a nearby behind-player to block forward travel; final projected-distance exclusion corrected
that regression without weakening the original behind assertion. No sign, speed, main, model, Olof/shared skeleton/pose or head-contact edits.

## Exact layout validation ratio (#930)

Run `PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chrome node tools/crashlayouttest.cjs http://localhost:8871 /tmp/layout`. This focused native fixture loads production CrashLog with actual browser canvas/DOM/viewport dimensions and a renderer-ratio stand-in, without apartment startup or WebGL. It checks 35 allocations (five portrait/landscape sizes × seven quality ratios), actual deliberate buffer-width/buffer-height/aspect/CSS-window faults, an independent visualViewport mismatch, preserved pinch-zoom/integer-allocation tolerance, the actual layoutCheck/report path, public two-decimal precision and unchanged source hashes. The correct 360×664 canvas with buffer405×747 uses exact1.125 internally and public1.13.

The original source produced a real native false buffer report for those dimensions; its driver exited1 and its raw result/PNG remain at `/tmp/lunden-precision930-surface/before/`. The fixed run exited0, all35 allocations passed, actual negative faults remained detectable and the inspected native canvas image says Valid layout. Final result/PNG and CLI are under `/tmp/lunden-precision930-surface/after/` and `after-cli.txt`; production loss/restore snapshot regression `crashsnapshottest.cjs` also exited0. Images are native diagnostic-fixture evidence, not gameplay or physical-phone screenshots. This corrects a diagnostic false-positive path; it does not establish the cause or fix of #669's WebGL context loss, and that parent stays open. No renderer/startup change, tolerance increase or public precision expansion was made.

### Actual frontal nose contact (#920)

Start native static8875 and local Worker8876 after the tested config is saved, then
run `PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chrome node tools/riflenosetest.cjs http://localhost:8875 http://localhost:8876 /tmp/rifle-nose`.
The driver obtains the original model directly from historical production commit
4b2a75e for exact position/normal/color/bone/skull-identity array parity, not a
copied geometry fixture. No apartment/bootstrap/WebGL is used. Native actual
triangles cover60 canonical appearances, bind/three standing updates and four
headings, actual first-contact positives/negatives, serialized r2/r3 rays and
r3 contact near maximum coordinates. Independent eight-corner rays inspect real
nearest faces around accepted contact cells; forged deeper-nose points are tested
behind actual nearer unsupported production surfaces. Two real Ghosts/Combat
WebSockets verify the Worker2HP/body1 receipt, public/local health, obstacle/miss,
invalid/interior/crouch fallbacks and one low-HP death/award/replay. The PNG is
actual marker/HUD DOM with measured protocol rows, not rendered avatar/gameplay.

Earlier diagnostic failures are retained: the first Worker process held the old
config while browser modules had advanced; a short fresh-Worker attempt fired
before the real500ms stable-state gate. These are not accepted full-suite runs.
The short protocol diagnostic then passed19 checks; full final coverage follows
in the issue evidence. No hardware/FPS/physical-phone/allpose claim follows.

#920 frozen native acceptance:24 PASS, actual CLI0, zero page errors/WebGL.
984 admitted nose contacts and39,816 unsupported nearest contacts yielded zero
false bonuses or lost admitted proofs across60 appearances/four headings/four
bind/standing samples. Independent488 actual eight-corner projected native
contacts stayed on nose;772 deeper-nose proofs with an earlier actual unsupported
contact were rejected. Sixty near-max-coordinate positives passed. Nose profile
vertex error≤5.13e-8m and pose/wire entry residual≤4.789mm; unchanged original
position/normal/color/skin/skull-identity arrays matched exactly. A separate replay
of the initial actual native contact inventory against the final pure helper
admitted244 positives spanning all60 appearances. The real local room/client
checks confirmed2HP/public+local8HP for all four canonical hairstyles using real
server-generated IDs, not model overrides. Twenty existing Worker tests also
passed/CLI0, including contact-less/invalid-v1 compatibility and real256-byte
packets. `/tmp/lunden-nose920-surface/final2/` retains full log, parity/style/first
shot/result JSON and the visually inspected `rifle-nose-native.png`;
`source-freeze.json` records the exact tested runtime/driver. Earlier failed runs
remain separate. The final harness connects the room only after its long native
geometry inventory, preserving the real120s movement-idle rule. No World/rendered
avatar, physical-phone, allpose or hardware-performance acceptance is claimed.

### Actual exposed rear skull (#933)

Start private static8875 and fresh localWorker8876 AFTER saved runtime edits, then
run `PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chrome node tools/riflereartest.cjs http://localhost:8875 http://localhost:8876 /tmp/rifle-rear`.
The original production model is extracted from6f35db5 for exact array parity,
not a copied shape/seed fixture. Native actual60 appearance/four heading/four
bind/standing samples cover nearest skull contacts and unsupported surfaces.
Independent eight-corner rays project accepted r3 cells onto actual first faces;
forgeries target the FIRST pureSkullEntry BEHIND actual hair/neck/other first
contacts, rather than testing only hc at the closer surface. Missing snapped ray,
front/side/steep approaches, long hair, boundary and near-max-coordinate cases
are explicit. Actual WebSocket serialized r2/r3/hc/256byte constraints are checked.
Three real server-generated hairstyle IDs get2HP through Ghosts/Combat/Worker;
long hair gets1HP. Actual public/local health, closest body, full obstacle ray,
miss/interior/version/crouch, one lowHPdeath/killUUID/award/replay and marker/HUD
are covered. Final beanie packet and room receipt use legal near-max coordinates.
The image is actual marker/HUD DOM, not rendered avatar/World/phone evidence.

Readonly diagnosis before runtime edits:20,160 rear native rays over60 appearances
and four bind/standing samples. The original proposed lower.024–.028 guess was
unsafe:12 actual earlier-hair rays admitted forged first pureSkullEntry points.
It was never product code. The supported lower band was narrowed to.020–.024;
a separate65-sample joint standing-breath/head-frequency cycle on four canonical
styles and8,060 rays, then15,600 near-cone rays (168 exposed positives/8,354
non-skull first contacts), found no admitted hidden-skull proof. The unchanged
15mm surface guard was retained. These are sampled conservative support checks,
not all continuous pose/scene/phone/FPS/anti-cheat certification. Raw diagnosis
and failed native-driver attempts remain under `/tmp/lunden-rear933-surface/`.

#933 final integrated acceptance:26 checks PASS, actual CLI0, zero pageerrors/
WebGL on the source-frozen core916+rear tree.7,659 admitted rear contacts and
38,181 unsupported nearest/approach cases produced zero lost bonuses or false
heads.11,652 forgeries at first pure skull entry behind a closer non-skull face
were rejected;2,552 independent cell-corner projections stayed on skull. All45
supported styles0/2/3 build/height appearances had actual positives;15 long-hair
appearances remained body-only (10,800 sampled nearest negatives).255 legal
near-max-coordinate native cases passed; actual serialized beanie packet also
produced Worker2HP with r2/r3/256byte/origin5000/contact5002 bounds. Entry residual
max13.0532mm remains below unchanged15mm; skull vertex error≤5.32e-8m and original
position/normal/color/skin/skull/nose arrays matched exactly.21 updated Worker
tests passed/CLI0. Artifact directory `/tmp/lunden-rear933-surface/final-complete`
contains parity/styles/first-shot/serialized-wires/result JSON and the inspected
850×500 `rifle-rear-native.png`; sibling .log/.exit record ALL PASS26/actual0.
`source-freeze.json` hashes the exact runtime/driver. Historical6f35db5 gate replay
of six actual recorded shot JSONs and current contact-less gates yielded zero
rear heads (`cached-gate-proof.json`); this is exact gate compatibility, not a new
live cached-Worker transport session.

Earlier failures remain separate: original fixture closer/wall points retained
front-shot−z coordinates; HTTP service then ended143 and one navigation refused
(no own termination command/product conclusion); a fixed4m snapped ray could
skip the narrow whole-cell kernel on one random model. Final fixture chooses real
legal shooter feet/camera distances and waits for ordinary5Hz publication, never
widening the patch/guard or overriding target pose. The first high-coordinate
fixture moved feet but left its camera far away, so genuine distance culling hid
the target; final moves both together and waits for ordinary visibility. The
intentional invalid-version9 rejection control is checked separately from valid
version1 packets. `--protocol-only` runs just the real transport/DOM assertions
for diagnosis; the final accepted run uses the complete default path.
### Lower-front jaw contact (#928)

Start an owned `python3 tools/devserve.py 8870 .` and a NEW owned
`node cloudflare/dev.mjs 8871` AFTER freezing backend/config sources; retain PID,
start time and hashes. Run `PLAYWRIGHT_MODULE=/path/to/playwright
CHROME_PATH=/path/to/chrome node tools/riflejawtest.cjs http://localhost:8870
http://localhost:8871 /tmp/rifle-jaw`. It runs actual Avatar/Ghosts/Combat, the local
room and original marker/HUD DOM with no bootstrap/WebGL. A finite180s grid
retains its measured checkpoint and fails on incomplete coverage; all60 canonical
looks/seven standing-bind samples/four headings, nearest unsupported surfaces,
forged deeper first jaw entry, misses and sampled whole r3-cell corners are checked.
Supported actual jaw-to-profile pose offsets are distinguished from a nearer
UNSUPPORTED surface. Gameplay uses fresh real attachments after the CPU grid,
without idle/timer/budget overrides, then verifies head2/body1, real full-ray wall,
miss/version/crouch fallback, low-HP single reset/kill/award/replay and all styles.
Output includes parity/result JSON, actual receipt/wire/style logs and reviewed
`rifle-jaw-native.png`. Node `cloudflare/players.test.mjs` also covers actual jaw
legacy/version/rate replay/lethal/public-reset/bounded-high-world/origin receipts,
while preserving prior recovery/rate/points cases. Keep FAILED partial/idle/proof
attempts separate; a green geometry result alone is not the vertical acceptance.
### Exposed frontal skull strips (#931)

`node tools/riflefronttest.cjs http://localhost:8878 http://localhost:8879 /tmp/rifle-front`
uses actual Avatar/Ghosts/Combat and index DOM without World/bootstrap/WebGL. It starts
its own fresh Worker after freezing runtime sources, verifies Linux PID/socket
ownership and checks those bytes before capture; an externally running Worker is
not acceptance. Default mode always measures both full inventories. An optional
fourth argument is a clean measured-grid-phase manifest. Replay fails closed on
any full producer-function SHA or complete runtime pathset/hash mismatch, incomplete
60-style/build/height Cartesian support, mismatched per-model totals or grid failure.
The full producer function is3,909 bytes, SHA256
`9bb88966acfa44d5ea7b1bd8a102a0cce3b9e6e388d283861a9f225adf698030`.
Replay measures the separate horizontal/diagonal inventory, actual eight-corner/
max-coordinate checks and whole fresh two-client protocol/HUD again. Real transmitted
packets, sender/target IDs, armed/forwarded state and acknowledgments are saved before
awaiting each acknowledgment.

Full native7 on2cbc250 measured60,532 admitted skull contacts,218,705 nearest
unsupported contacts and32,412 forged first-skull contacts behind nearer real
non-skull surfaces, all with zero lost proofs/false bonuses.103,680 vertical-oblique
contacts were included. All60 appearances/four headings/bind plus three standing
updates had positive support; actual vertex error≤5.313e-8m, entry residual≤6.778mm.
Native7 whole23 checks/CLI0 included new2,160 cells/17,280 projected actual corner
rays, including both near-maximum coordinate signs, all supported.

Native9 replayed only native7's exact measured primary grid phase, then newly
measured the independent horizontal/diagonal plus wide unsupported inventory:
143,824 admitted contacts,130,673 unsupported nearest contacts and15,439 hidden
first-skull forgeries, all60 appearances/poses/headings and zero errors. Its whole
24-check cell/protocol/HUD run had actual CLI0/zero page errors/WebGL. This is finite
sampled support for named guess bounds/cone, not all-pose anti-cheat physics.

Earlier whole failures remain separate: native1 lost its peer after the real120s
idle rule; native2's first protocol shot lacked an acknowledgment/CLI1 (exact cause
not established); native3 rejected an incorrect function locator. Native4/5/6 had
real clean cell/protocol results, but their replay hash locator covered only the
function prefix ending at an internal initializer, not the whole function. That
harness binding defect was corrected before final publication. Native7 remeasured
the full inventory without replay, and native9 uses the correct full-function hash.
Native8 kept its hidden-sample requirement and exited1: tight ROI horizontal rays
had136,144 positives/71,216 negatives but zero covered contacts. Native9 added
independent wider negative inputs without removing that requirement. No product
failure or physical-phone cause is inferred from these harness failures.

Rebase to933/e097d108 adds an independent rear branch. Original producer hashes
were preserved; the changed config hashes are:

- Measured config SHA256: `d15b18d5f9d19b00a85c1003497262d086befa77402eae70db0bb764f6a25f91`.
- Merged config SHA256: `be97a4fb1f9f0c1e4282bd27db0c5290e4849975d99a9f262d6fb37e043e7fec`.

Eleven relevant functions (front/core/contact, skull/nose profiles/entry, shared
sphere/profile entry and avatarLook) are byte-identical; the entire original head
policy is deeply equal after removing the added rear policy. Rear requires local
forward>0; every measured frontal inventory ray has forward<0, so this added branch
cannot affect those cases. The standard replay guard still rejects this changed
config; no producer hash was rewritten and no new fullgrid on merged bytes is claimed.
A separately recorded temporary integration companion measures the whole18 actual
cell/max-coordinate/fresh-Worker/protocol/HUD checks on merged bytes: PASS/CLI0,
zero page errors/WebGL. Node front/players/recovery passed29 tests/CLI0 on merged
bytes. The root and worker inspected its actual “Huvudträff!” DOM image.

The real local room confirmed2HP/public and local8HP, body/version/interior/crouch
fallbacks1HP, wall/miss none, one lowHP lethal UUID/award/reset and replay without
extra effects. A real transmitted first packet was103 bytes with r2 origin/r3
direction/contact. Recovery tests use an explicit controlled server clock with
heartbeat time advanced separately. Artifacts: `/tmp/lunden-priority-931/`, immutable
native7 producer driver/manifest, native9 logs and JSON, integration companion,
rebase-compatibility/source proof and visually inspected PNG. This is native
geometry/DOM/local-Worker evidence, not World/rendered-avatar/phone/FPS/all-pose proof.
Deployment is recorded separately before a live-Worker claim.

A second integration rebase to928/599c9f adds the separate Jaw core. Its canonical
absx≤.008/y.032–.048 cannot overlap Front absx≥.061/y.078–.105. The changed merged
config SHA is `019a2f7213cededc50a482abb932a9f4ab24ce4ac6a165264284a48f9877918d`;
measured Avatar SHA was `bacc5d9b334f99bf8a88f1279ef10839db262d358d5faf5c904b1aea0e89f118`,
merged Avatar SHA is `1090e861549fd1f7df5a75411fad698aee9798e6f223ab17b46dc5b9ef5cc038`.
The former11-function equality now applies to10 functions; generic Contact adds
Jaw-first profile dispatch. The original entire head policy is deeply equal after
removing additive Rear/Jaw/JawPatch fields. Independent historical Avatar2cbc250
versus merged actual modules: all60 appearances,420 original position/normal/color/
skin/Skull/Nose arrays and240 bone matrices across bind/three standing updates
match exactly; new Jaw and Skull tags never overlap. Thus Jaw cannot replace an
accepted Front contact, and nearest production geometry is unchanged. The separate
`integration-jaw` phase again measured all18 cell/maxcoord/fresh-room/protocol/HUD
checks on these merged bytes, actual CLI0/zero errors/WebGL; Node front/players/
recovery passed30/CLI0 (new Jaw test accounts for the extra test). Current234
runtime/driver hashes match that integration freeze. Comparison to old native9
has explicit config/Avatar exceptions plus one scoped-negative-log-label correction
in the driver; no blanket byte match, rewritten producer hashes or new merged
fullgrid is claimed. `jaw-rebase-compatibility.json`, `jaw-compat.{cjs,log}`,
`jaw-geometry-parity.json` and `integration-jaw{.cjs,.log,/}` retain this additional
compositional proof. Standard full tests and strict replay guards stay intact.

## Lateral skull actual native acceptance (#932)

`PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chrome node tools/riflelatertest.cjs gameURL workerURL artifactDir` loads actual index/Avatar/Ghosts/Combat with a freshly started local Worker, suppressing only bootstrap and forbidding WebGL. Its bounded480s browser lifetime includes native geometry before room connection, then actual client/server actions and native HUD images. The independent pre-change Avatar comes from published6f35db5; physical position/normal/colour/skin/skull/nose arrays remain exactly equal across60 canonical style/build/height variants. No copied PRNG, hidden hair, alternate proxy or increased tolerance is used.

The original full native run passed26 checks/CLI0:6,628 actual nearest-side positives across60 variants, four headings and bind/three updated standing poses;39,452 nearby negatives with0false lateral positives;1,656 independent eight-corner native rays with0wrong surfaces;19,661 forged FIRST pure-skull contacts behind actual nearer non-skull surfaces with0accepted lateral bonus. Pure profile parity was≤5.313e-8m and first-entry residual≤5.734mm, within the unchanged15mm bound.620 near-max-coordinate packets and missing-ray failclosed cases passed. Read-only pre-implementation surveys separately contained35,068 side/oblique entries and53,476 broad-origin entries (5,044 actual non-skull-first), with0hidden positives inside the proposed side patch; these surveys are diagnosis, not Worker acceptance.

Real client→Worker checks include head2/body1, public/self-health, both-side lethal contact, one death/reset/killUUID/award, acknowledgment replay, nearest native body, wall inside the old0.3m gap, miss, forged interior/version, crouch fallback and all four actual server-id-derived hairstyles. The final driver additionally verifies the actually serialized WebSocket r2/r3/r3 packet/cap and captures the target's real8/10 life DOM. Source hashes are frozen and checked; artifacts/CLI/actual exits/inspected native HUD images are retained under `/tmp/lunden-lateral932-surface/`.22 Worker Node cases passed, preserving recovery/alarm/cost/legacy behavior. Native fixtures are neither rendered-avatar/World nor physical-phone/complete-server-physics acceptance. Original front/core and nose branches remain separate.

The broader greeting-arm check exposed a real candidate-policy error before publication:3240 actual rays over60 variants produced360 body-first contacts and180 accepted deeper-skull forgeries. That initial policy was rejected. The delivered first slice uses authoritative attachment gt absence rather than a client-animation clock; both sides become body1 after any accepted greeting, while core/nose/rear stay independent. `--greetings` is a separate focused mode, not a replacement for the ordinary geometry/room mode. It passed15 checks/actual Node exit0 after final rear/core integration:5400 independent actual armed-forward/saber-swing/body-turn rays over60 variants had0body-first forgeries before greetings; actual Ghosts greeting created a nearer waving arm, deeper forged packets on both sides remained body1, a genuinely paused wave stayed frozen after real2.7s, repeat/latewelcome still retained correct health, and a fresh target attachment again got native2HP.24 Worker Node tests include hibernation/persisted gt and independent nasal confirmation.

Ordinary merged geometry/room run passed28 checks with the same6,628 positives/39,452 negatives/1,656 corners/19,661 deeper forgeries and inspected actual target8/10/receipt-marker DOM images. Its source precedes the added greeting-context restriction; later profile math/physical arrays are unchanged, and the new behavior is separately exercised by the15-check mode plus24 Worker tests. Exact Node exit0 was retained by strace PID826014; its transient systemd unit was collected, so default inactive ExecMain fields are not exit evidence. A separate ordinary-session attempt ended143 along with its HTTP server, sender unknown; partial native/protocol output is retained and is not green. A cheap exact protocol probe subsequently passed13/exit0. One first greetings attempt failed1 because the paused driver issued a position update before the normal5Hz slot; numeric polling of actual Ghosts.update fixed the fixture without changing its send budget. These failures remain in their original directories.

Final scoped-mode artifacts: `/tmp/lunden-lateral932-surface/greeting-fixed/`, `greeting-fixed-cli.txt`, and retained owned unit `lunden-932-165737-greetings` reported ExecMainCode1 (normal exit), ExecMainStatus0, active/exited. Named bounded owned HTTP/Worker/test services isolate lifecycle; no attribution of the earlier143 to exec cleanup is claimed. Native images are diagnostic DOM/confirmed markers, not rendered avatars or physical-phone acceptance. #932/#917 remain open with #935 for post-greeting coverage.

Final publication rebase preserved incoming #928 jaw dispatch/attributes and all core/nose/rear/jaw entry helpers. The repeated focused greeting mode on that combined source passed15/actual Node exit0, with retained named-unit normal-exit status and reviewed PNG in `/tmp/lunden-lateral932-surface/publication-ready/`; complete Worker suite passed25/exit0. The first post-rebase mode invocation failed before logic when the deliberately bounded owned HTTP unit had expired; its CLI1 is retained in `publication-cli.txt`. The successful retry starts a fresh owned server and verifies HTTP200 before launching. `publication-scoped-proof.json` separates unchanged shared helper/Avatar/Combat/Ghosts bytes from the new lateral policy/context dispatch; it does not assert whole config identity with the earlier28-check run.

For #715 `tools/nerfreciprocaltest.cjs --projection-plan` runs real native two-client Worker/WS receipts plus final actual local/incoming dart projection under main72° camera (no WebGL). `--apartment` requires a separately approved single240s heavy run: first-send checkpoint precedes early clear/target guard;2×2 actual confirmation/lives checks precede two final draws and CDP PNG. Final retained real effects step1/240; no TTL or frustum changes. A first cache deadline remains CLI1 with incomplete logic/images and completed cleanup, even when native20 and component118/485 are green. See issue715 validation for the preserved post-remedy failure.

### Extra frontal nose cell verification (#934)

Use `tools/riflenoseextratest.cjs GAME WORKER EXTERNAL_OUTPUT` with explicit
Playwright/Chromium paths. Default runs geometry and protocol; `--geometry`,
`--protocol`, `--forgery` and `--legacy` are separately named diagnostic stages,
not whole-suite success or automatic fallbacks. Every result records its mode,
actual failures/completion and selected source hashes; native geometry has a7min
browser-close bound and streaming partial checkpoints. Start an owned Worker
AFTER the backend freeze and retain PID/cwd/start time/loaded validator hash.
The legacy mode expects a freshly booted old validator, never the current Worker.

The dense native inventory observes actual triangles and all eight corners for
every admitted cell, actual translated near-limit geometry, unchanged historical
mesh arrays and canonical styles/builds/heights/standing samples. A test-only
export of private part ranges from historical4b2a75e Avatar provides semantic
first-face taxonomy; it changes no production geometry or geometry formulas.
Distinct failed attempts remain in `/tmp/lunden-priority-934`: the overbroad
bounds; the old fixture omitted #916's required o/d comparison; its first part
taxonomy incorrectly expected a public region attribute; coarse live aiming
missed admissible natural phases. None is relabelled a green full run. The actual
6mm policy was never increased. Follow the scoped stage evidence in interactions
and storage; no WebGL/World, physical phone, hardware performance or all-pose
acceptance is claimed.

Final integration artifacts are `/tmp/lunden-priority-934/protocol-rebased/`,
`forgery-rebased/`, `ghost-arm-final/`, `legacy-native/`,
`rebased-worker-provenance.json`, `rebased-original-nose-parity.json` and
`/tmp/lunden-priority-934-node-rebased.log`. The actual Ghost arm probe is an
external one-off driver with a180s browser-close bound; its first contact proof
is the shared first pure Nose entry on the exact serialized ray. Controlled
Avatar-pose diagnostics remain external, and their labels do not establish
actual Ghost timelines. `full/` retains CLI1 despite its four completed green
geometry blocks; later separately named protocol/forgery stages supply scoped
compositional acceptance, not a rewritten full-suite exit or fresh dense grid.

Publication proof uses `protocol-publication/` (21/CLI0 and inspected native
HUD PNG), `forgery-publication/` (3/CLI0), `publication-freeze.json`,
`publication-worker-provenance.json`, `worker-deploy-jobs.json` and
`/tmp/lunden-priority-934-node-publication.log` (32/CLI0). PID1793463 owns
8877 after the shell ran Python source selection/manifest write and THEN the
final Node command. `/proc/PID/stat` birth time belongs to the inherited shell
process and is not a Node-exec/module-import timestamp; its integer-btime
estimate also loses fractional boot epoch precision. Both original estimates
and this limitation are retained, with no producer hash rewritten. The actual
script order and unchanged manifest/runtime bytes establish the fresh-module
provenance. The final proof does not turn earlier full/controlled-pose failed
attempts into successful exits. No new dense whole-grid or GPU test was run
after the independent Jaw/Rear/Front/Lateral/cache integration.

`tools/spatialcachetest.{cjs,html}` (#715) loads unchanged published `1c5a079` and current combatworld builders with actual Three and no WebGL. Pass an external ≤16MiB saved `largest-geometry.json` as third CLI argument. It records source/served/input hashes, completed raw results before PNG, exact old/current spatial/private buffers, source-expression counts (not actual heap allocation), independent native hit metadata and normal/normalized/interleaved/custom/invalid/mutation/dispose/group/drawRange controls. Matched reversed-order timings use unchanged production advance bodies with native clocks in a controlled stepped builder; they do not execute ordinary idle scheduling or measure World/phone/FPS. Final source-byte checks include both fixture files. Reproduce: `PLAYWRIGHT_MODULE=... CHROME_PATH=... SHOTS=/tmp/spatial-cache node tools/spatialcachetest.cjs http://localhost:8873 /path/to/largest-geometry.json`. Existing `tools/combatcachetest.cjs http://localhost:8873 world` remains the broader485-check native collision regression.


### Actual rear arm-first regression (#936)
Start a fresh owned local Worker AFTER freezing its imported backend/config bytes
and serve the same tree. Run `node --test cloudflare/players.test.mjs`, then
`PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chrome node tools/reararmtest.cjs http://localhost:8870 http://localhost:8871 /tmp/rear-arm`.
The native CPU/DOM fixture uses real Avatar/Ghosts.draw/Combat and actual sockets,
finds an actual server-assigned appearance in bounded reconnects, accepts a genuine
greeting and r2 heading3.14, then performs a real paused draw. It proves elbowR
first, native head rejection, and the original96-byte deeper-skull proof receiving
body1, public/self health, one lethal kill/award and idempotent body marker. It
checks zero WebGL/pageerrors and saves the actual HUD PNG. The bounded650ms quiet
wait satisfies the existing server stationary gate only; it is not evidence of
completed animation draws. Separately run the unchanged `tools/riflereartest.cjs`
with explicit game/Worker/artifact args and `--protocol-only` for existing pre-greet
rear2HP, body/wall/miss/legacy/lethal/style/near-max controls. Keep pre-fix failing
logs separate. Node covers invalid/rate greetings, long pause, hibernate, latejoin,
fresh attachment and independent core/nose/jaw. No apartment/phone/FPS claim.

#936 correcting acceptance (parent remains open): `native-rebased/` passed10/CLI0
and unchanged `rear-control-rebased/` passed20/CLI0; Node passed27/CLI0. Both actual
HUD PNGs were inspected, zero pageerrors/WebGL. The owned fresh Worker1808358
started17:42:21Z after `rebased-freeze.json`; all250 manifest paths matched after
both runs. The imported #715 combatworld change justified these narrow reruns;
no geometry was changed or broad grid repeated. Before-fix `worker-repro.json`
retains its real head:true/l8 failing result separately. Finite actual Ghost pose
diagnosis over60 models/4860 rays found204 arm-first deeper claims during paused
waves, zero in sampled quiet/turn/saber cases; this does not establish all-pose
coverage and did not justify a new rear heading restriction. Artifacts stay under
`/tmp/lunden-priority-936/`. Post-greet rear restoration is #941, so this correcting
Refs step does not close #936 or its head-feature parents.

Runtime `ecf8ffb` was deployed by Worker-run38441111720/job115447621923: the
actual cloudflare/wrangler-action step completed SUCCESS, not merely a green
workflow or skipped deploy. Final published execution manifest remained250/250
byte-identical. This confirms deployment of the bounded private rear gate only.


### Front history correction after posed counterexample (#931, partial)

The earlier3313c5d grid is finite standing-pose evidence, not all-pose acceptance.
A separate actual Ghosts forward/saber/greeting/body-turn/paused-draw probe found
19,995 unsupported-first/deeper-Front classifications among90,720 rays (CLI1).
A fresh owned two-WebSocket Worker PoC froze the same real Nose-first pose after
an accepted r2 heading change and650ms quiet: the actual client body packet took
1HP, but forged deeper skull hc took2HP (9→7). Its diagnostic exit0 asserts this
bug, not safety. The nearest surface was the real rotated nose/head; no generic
claim that all failures were arms or that wall-clock quiet settles pose is made.
Original artifacts remain under `/tmp/lunden-priority-931/front-turn-frozen-before/`.

The bounded correction admits ONLY this new Front branch for a known fresh,
ungreeted, unturned attachment. First valid heading is distinct from later valid
heading changes; unknown legacy history fails closed. State/history persists
across hibernation, returning to the old heading, death and recovery. Client
claims and invalid/rate-rejected states cannot restore it. Core/nose/jaw/rear/
lateral remain separate, and no wire field, animation or generic tolerance changes.
Full restored post-turn/greeting Front support is the functional remainder #939;
#931 and its parents remain open.

`tools/riflefronttest.cjs ... --history` runs a separate focused fresh-owned native
protocol/DOM scenario, not another whole geometry grid. history2:14 PASS/0 FAIL,
actual CLI0, zero page errors/WebGL and234 runtime/driver hashes unchanged before
PNG. Real client head2 precedes the turn; the same paused Nose-first/body packet
and forged deeper hc both take body1 afterwards, replay adds no effect, a new
socket/first heading restores head2, accepted greeting blocks Front, and a late
observer sees no private history. Actual raw packet/acks/pose/provenance are saved
before capture; the inspected native HUD shows the corrected receipts and fresh
head marker. Independent frozen after-PoC confirms body9→forged body8.

Focused Node front/players/recovery cases:38 PASS/0 FAIL, actual CLI0, including
first-heading/rate/invalid/rounded input, legacy pending/hibernated attachments,
fresh id, greeting privacy, one body-only lethal UUID/award and recovery. history1
remains CLI1: three fixture failures exposed unsynchronized cached heading and
rate-limited position publication at reconnect; history2 synchronizes real
accepted state before reconnect/shooting, without changing product rules.
Default full-grid and strict replay/producer-hash guards are preserved unchanged;
these focused checks do not erase the earlier failed runs or measure a new grid.
Artifacts: `/tmp/lunden-priority-931/{history1,history2,front-turn-after}/`,
`guard-node2.log` and persistent `931-history-proof.json`. This is real imported
Avatar/Ghosts/Combat, actual local Worker and native HUD evidence, not rendered
World, phone/FPS, complete server physics or all-pose headshot support. Deployment
of the corrective commit must be recorded independently from3313c5d's prior deploy.

After incoming936/ecf8ffb, the independent Rear permission is retained as argument9,
with strict private Front permission in argument8. A new focused merged-byte
`history-merged` run again returned14 PASS/0 FAIL and actual CLI0; Node cases now
return39 PASS/0 FAIL/CLI0 because the incoming Rear test is included.234 runtime/
driver hashes match the fresh-owned Worker freeze, its listening PID exited and
the actual HUD PNG was inspected. Earlier history2/38 results remain historical;
this is new focused integration evidence, not a repeated full geometry grid.

Corrective publication5c86a1747e2bddd25c5b60424bee367d29a41114 was genuinely
deployed: Worker run38441650472/job115449468074 has SUCCESS on the actual
`cloudflare/wrangler-action@v3` step, with Uploaded/Deployed output at17:49:06Z
and version `c8831a7d-aff1-475b-bb93-bf670f6ede58`. Log and job JSON are retained
in `/tmp/lunden-priority-931/history-{wrangler-job.log,deploy-jobs.json}`.
This confirms publication/deployment of the bounded restriction, not live-device
or full post-turn support. #931/#939 remain open. The final docs-only rebase
preserves all234 measured runtime/driver hashes, and owned Worker/browser/server
processes were stopped.


### Owned native browser cleanup regression (#942)
Run `PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chrome NATIVE_BROWSER_ARTIFACTS=/tmp/native-browser-check node --test tools/nativefixturebrowser.test.cjs`,
and the existing `tools/fixtureviewport.test.cjs` with its own artifact directory.
The helper regression uses actual owned Chrome/default-context DOM for normal
and early-error closure, controlled transient/permanent ENOTEMPTY and nonretryable
removal failure, repeat-close rejection, and startup original/combined failures.
Fault injection is restricted to the exact owned profile, leaving Playwright's
other internal temporary cleanup untouched. Each record saves actual pid/profile,
master exit, profile status and source hash. Failed-removal controls retain the
profile as proof until their own test finally restores real removal; they do not
leave profiles behind. A separate real early-error process must retain actual
CLI1/original error after successful cleanup, rather than relabelling it PASS.
These controlled faults test the error contract; they do not prove the OS cause
of #940's two observed ENOTEMPTY races. No app/WebGL/performance acceptance.

#942 scoped acceptance: combined six cleanup tests plus the original viewport
test passed7/CLI0 under `/tmp/lunden-priority-942/frozen.log`; all three selected
source hashes stayed exact. Normal and early-error owned masters exited and their
profiles were removed. Controlled transient ENOTEMPTY succeeded after3 calls;
permanent ENOTEMPTY failed after6 attempts/approximately1.5s of configured retry
wait and still rejected repeated close. EACCES failed in1 attempt. Startup
ENOENT survived successful cleanup and remained cause/first error when controlled
cleanup also failed. A separate real native DOM early-error driver retained
actual CLI1/original EARLY_FIXTURE_PRIMARY_942 with own profile removed. Native
normal.png and original phone/desktop PNGs were inspected. All recorded own
profiles were absent afterward. The first broad fs mock also affected Playwright
internal temporary cleanup and failed two assertions; retained as failed, then
restricted to the exact owned profile. No unobserved ENOTEMPTY OS cause is claimed.

### Immutable-standing greeting-left contact (#938)

`tools/riflelefttest.cjs` combines authored actual Avatar/Ghosts first-state/welcome/wave/paused/repeat/held-rifle/saber/suit poses, independent r3-cell corner rays, the actual PlayerRoom private-attachment/hibernation runtime, and ordinary two-client Combat/Ghosts → local Worker actions with public HP/receipts/DOM markers. It uses no WebGL or World and sends no forged head/network probes. Run with the local HTTP/Worker URLs and an artifact directory; `--native-only` covers pose/history without connecting the browser clients.

The pre-runtime fixture covered all60 canonical appearances: 10,260 nearest skull rays, 9,120 independent corner rays, 60 no-default joins and120 first-valid/late-welcome body=gaze checks, zero earlier-body/hair/face/corner errors; all60 right-wave controls had an actual nearer arm. 324 aimed boundary samples were conservatively declined by the existing lateral across guard; the first overly strict test assertion is retained with CLI1, then corrected to distinguish conservative filtering from a physical first-surface failure. Bounds and phase sampling are an explicitly limited standing family, not an all-pose/continuous-phase/phone guarantee. Runtime geometry/profile/core/front/rear/nose/jaw bytes are preserved outside the owned additive dispatch.

Final #938 current-source room-only proof after integrating d0bbb9e and all three named history permissions:29 checks, CLI0, no page errors/WebGL, ten ordinary shots with ≤104-byte r2/r3/r3 packets. The actual left receipts after greeting/paused/repeat/item-suit-score changes take2HP; right takes1HP; low1HP left produces one UUID/death/reset/award; a transmitted .1m change and return take1HP with actual client hc still present after rendered-feet/speed/gait settle, and crouching remains body-only. Reconnect establishes fresh eligible history. Late observer uses its own scene/camera; public/local HP and replay-safe real HUD marker are verified. `node --test --test-name-pattern="#938" cloudflare/players.test.mjs` commits two private-history and named/legacy-default guard regressions (CLI0); incoming `riflefront.test.mjs` six cases also pass.

Artifacts `/tmp/lunden-left938-surface/final/` include current result/source hashes, all receipts/wires, progress checkpoint and inspected actual DOM HUD PNG. Its changed/returned annotation prints undefined/undefined because body acknowledgements intentionally omit head; assertions correctly normalize that omission to body-only. Failed initial assertion, .01m unsent movement, shared-observer-scene obstruction and received-versus-rendered gait waits are retained; these harness corrections changed no runtime geometry or precision guard. Use `--native-only` with a sibling `native/` directory before `--room-only` into `final/`: reuse requires exact unchanged Avatar/Ghosts/Olof bytes, production shape/profile/leaf/bounds/canonical-look contract and native-function bytes. The API/default changes are verified by fresh ordinary room/Node execution, not assumed covered by an old runtime source hash. No all60 grid was repeated for independent incoming front/rear gates.

### Layout diagnostic classification (#940)

`tools/layoutdiagnostictest.cjs GAME EXTERNAL_OUTPUT` uses an owned native
Chromium default context via `nativefixturebrowser.cjs` (Playwright≥1.60,
full Chrome executable), original index-CSS/viewport/CrashLog and one small
real WebGL scene. No apartment/bootstrap is loaded. Two tabs are created BEFORE
CDP mobile metrics; bringing the other tab forward causes actual visibility
changes. It rotates852×393→393×852 during30s hidden time, then resumes and
returns to landscape. Direct CDP screenshots check unchanged CSS/inner/buffer
before/after capture; portrait PNG shows the ORIGINAL rotation curtain rather
than an interactive portrait game. Local intercepted POSTs never reach public
crash storage. Browser-close bound120s; external runner bound150s recommended.

Additional intentional diagnostic fixtures test a real hidden canvas-width
fault, foreground camera misprojection, one core measurement per emitted
report and the unchanged three-layout-report cap. Pure measurement inputs
cover hidden visualViewport disagreement, pinch/tolerance and buffer/aspect
classification; they are NOT a physical visualViewport or Safari reproduction.
`cloudflare/crash.test.mjs` tests actual Worker POST/public classification,
legacy/malformed enum omission and privacy. `tools/crashtest.cjs` keeps all
original actions/assertions and also checks surface-css on its existing width
fault; its broad apartment suite is separate from this targeted verification.

Baseline artifacts `/tmp/lunden-priority-669-rotation/actual-cdp-capture/`
have10 checks/actualNode0/36.563s and three inspected PNGs. Earlier `actual/`
retains the first capture/new-tab-size fixture limitation and its blank edge;
it is not an application white-strip bug. These local durations are fixture
execution times, not FPS/CPU benchmarks, physical phone results or a crash fix.

The #940 after-code scene's geometry/rotation/capture/background classification
passed, but its original full driver exit was1: later controlled cases reused
a quota already consumed by one background report and two existing start-check
duplicates. That producer and its hashes/PNG remain unchanged. The default driver
now isolates controlled classification in a fresh native DOM page with a normal
new CrashLog quota; `--classification` runs ONLY that page with WebGL forbidden.
No quota is reset and no second GPU run is required for this isolation correction.
The observed eight classification assertions passed; its process still exited1
when the pre-existing native browser helper's profile removal threw ENOTEMPTY
(#942). These are separate facts, not a green full exit. The actual scene-function
body and six runtime/test paths matched the compositional producer exactly;
only the test driver's isolation/entry changed. Native helper cleanup is outside
this diagnostic-data change. `cloudflare/crash.test.mjs` passed17/17 with exit0.

After #942's bounded cleanup was published, the isolated native classification
phase passed9 checks with actual process exit0, no WebGL calls and an inspected
`classification.png`; existing Worker crash tests passed17/17 with exit0. The
feature driver adopts `close(primaryError)` in catch/finally, rethrows the original
failure and records actual process/profile absence and any cleanup error. Final
`cleanup.json` records both absent and null primary/cleanup errors. Its controlled
DOM/camera/CSS inputs are labelled explicitly; no physical iOS fault was reproduced.
Artifacts: `/tmp/lunden-priority-940/classification-after-942/`, corresponding
exit/log files and `after-942-composition-proof.json`. The original actual scene
body remains byte-identical (SHA2567b59b437b3f12a95be38ae48a68db5c280bcdf36913376fbb9482ab97a2e90de)
and CRASHLOG policy is unchanged. Independently published head-config code and
helper/test-driver cleanup/isolation account for the stated full-file deltas;
there was no new GPU run and earlier producer exits/hashes were never rewritten.

Final #940 runtime publication ffd0886 retains the inspected native9/CLI0 and
Worker17/CLI0 proof, recorded successful owned cleanup, explicit configuration
exception/unchanged CRASHLOG policy and unchanged earlier scene producer body.
Worker38444479768/job115459174790/actual Wrangler step and Pages38444479778
succeeded. This closes the diagnostic category slice only; #669 remains open
for the physical landscape-return question and unreproduced square CSS state.

### Lower central nose band (#937)

`tools/riflenosebandtest.cjs GAME WORKER EXTERNAL_OUTPUT` uses actual index/Avatar/Ghosts/Combat and a fresh local Worker with bootstrap suppressed and WebGL forbidden. `--geometry`, `--highworld`, `--forgery`, `--protocol` and `--legacy` identify separately bounded stages; completion, actual failures and runtime/driver hashes are recorded. Every positive geometry cell gets eight independent native corner rays; historical023f4ca Avatar physical arrays and shared Nose vertices are independently compared. Head aiming and firing occur atomically on the same naturally posed actual closest surface, without changing bones or hiding hair.

Artifacts remain under `/tmp/lunden-nose937-surface/`. Initial empty lower-tip candidate and broad residual inventory were diagnosis, not acceptance. `geometry2/` retains CLI1 solely because a copied bind-only high-coordinate expectation had0cases, despite its four completed positive/residual/negative/corner blocks passing. Corrected standing `--highworld` checks native translated contacts; cells which cross the whole-cell boundary after quantization must explicitly fail the new region and remain unsupported. The FIRST pure Nose-entry negative stage checks actual nearer hair/skull/eye/jaw/neck/torso, rather than a guessed deeper endpoint. A first narrow negative grid did not observe neck and remains CLI1; the expanded independent negative target grid supplies that missing actual family. Initial protocol aiming lost its tiny cell across asynchronous natural-pose updates and remains CLI1; atomic actual aiming/fire fixes the fixture without modifying production timing or bounds. An initial cap lookup used the wrong export and failed before any geometry; a wrong recovery test path also remains a failed command. No earlier incomplete/nonzero stage becomes a green full run.

Scoped completed results: protocol2/23 checks/CLI0 (all four actual server-id hairstyles, actual serialized cap/precision, public/self health, one lethal UUID/award/reset/replay, wall/miss/body/invalid/crouch); highworld2/4/CLI0 (76 accepted translated contacts and40 explicitly unsupported whole cells,0unexpected); forgery2/4/CLI0 (9528 observed FIRSTpureNose deeper points behind closer hair1299/skull351/eye2816/jaw2924/neck67/torso1355/other716,0bonus); legacy/7/CLI0 (fresh original023f4ca config via an external loader gives actual new-client body1/ordinary marker/replay-safe health). Worker/recovery33 passed/CLI0 before final incoming-history integration. The inspected protocol2 marker/HUD image and legacy ordinary-marker image are genuine native DOM captures. Final `publication-ready/` passed24 checks/actual Node exit0 after incoming front/rear history and named greeting-left integration on5025da0a; both actual receiver8/10 and shooter authoritative Huvudträff native PNGs were inspected. Final Worker/recovery36/36 also passed/CLI0. `publication-source-proof.json` reverses only the own band additions to reproduce entire origin config/Avatar exactly, verifies all PlayerRoom/Worker/Ghosts/Combat/Olof bytes against origin and all13 physical/profile/nose/jaw/band helpers against the original geometry producer. Earlier whole config/source hashes differ only because of the documented incoming guards; they are not falsely called current hashes. `publication/` is a separate failed connection attempt: the stopped transient Worker unit had been collected, so restart failed before room connection. A new uniquely named bounded owned publication Worker was created and its ready GET/players426/PID/start record preceded the successful final client logic. Earlier failed commands/captures remain separate. These images are real diagnostic DOM/receipts, not rendered-avatar/apartment or physical-phone/FPS proof.

Published runtime e385c6cc0e928d5a7ecafde6a868e94f43603b57 includes the Swedish visible entry750 in the same commit. All seven final native runtime/driver hashes match it exactly after the last07bfb171 documentation rebase; no broader geometry rerun or claim of a green original full-stage exit was made. Genuine Worker run38444878563/job115460536183 completed with the actual `Run cloudflare/wrangler-action@v3` step successful; Pages38444878523 also succeeded. This deploy evidence is separate from the actual native local acceptance and establishes neither a live-client write nor physical-phone verification.


### Bounded immutable greeting-Front acceptance (#943)

Command: `PLAYWRIGHT_MODULE=... CHROME_PATH=... node tools/riflefrontgreetingtest.cjs
http://localhost:8878 http://localhost:8879 /tmp/front-greeting [CLEAN_GRID_PROOF]`.
Default measures again. Explicit replay rejects different complete grid function
hash, ANY production path/hash mismatch, failed/incomplete phase or incomplete
60-look matrix; it never declares a failed whole run accepted. Actual helper
probe passed7 checks including six deliberately corrupted proof controls.

Read-only feasibility:207,360 narrow-band rays, all60 canonical variants/four
first headings, held/saber/wave/repeat/6s delayed/capped paused draw; every nearest
contact Skull, but no hidden contacts, so this alone was ONLY positive feasibility.
Native1 independently measured the wider actual grid:146,655 rays,21,608 supported
nearestSkull positives,38,090 nearer unsupported surfaces,33,035 FIRST pureSkull
hidden forgeries,17,216 actual eight-corner contacts, all60 styles/builds/heights,
zero bad/cornerBad. Maximum profile/quantization residual3.175494mm under unchanged
15mm bound. Actual first heading variants include r2=3.14; no later heading is
assumed settled. Actual wave/saber/repeated/delayed/capped draw and oblique/outer
rays keep hair/nose/face/arm/body present throughout; no removed occluder.

Native1 whole CLI1 is retained: its live aim fixture passed Vector3 to the
array-only predicate, so no bounded aim was selected after the clean grid phase.
Native2 explicitly reused ONLY that fully hash-bound clean grid phase, confirmed
real pre-greet/greet/repeated-wave head2, then whole CLI1 because an immediately
queued body shot lacked a reopened ordinary5Hz send slot while drawing was paused.
Native3 preserves both failed artifacts and runs fresh owned Worker/protocol/
HUD with explicit valid send scheduling:21 PASS/0 FAIL, actual CLI0, zero errors/
WebGL. No new dense grid is claimed in2/3; producer function/runtime hashes remain
unchanged. Raw original producer/phase extraction/packet/receipt/provenance and
actual exits are saved under `/tmp/lunden-priority-943/`.

Real client shots confirm before-greet head8, after-greet head6, repeated delayed
capped-wave head4; contactless/version body3/2, one low-HP lethal UUID/award/reset,
no receipt replay effect, moved-and-returned body9, fresh greeted socket head8,
public+self health and late welcome privacy. Inspected actual native HUD shows
these rows and the authoritative Huvudträff marker.234 runtime/driver hashes
match the preboot source freeze; owned Worker PID1841312 owned its8879 listen
socket and exited after this run. This is real modules/local room native evidence,
not a rendered avatar/World, phone/FPS or universal anti-cheat/pose proof.

Focused Front/recovery Node:15 PASS/CLI0. Final combined Front/players/recovery:
45 PASS/CLI0. Earlier Node1/2 fixture failures remain: a coarse fixed snapped
profile aim was replaced by bounded actual assigned-profile input selection;
recovery from8 is correctly9 after60s and10 after120s; the original general-Front
greeting suppression case now tests a point OUTSIDE the newly supported subset.
An independent old lateral test can conflict with published938's reopened left
family on random appearances: exact e385c6c baseline sources reproduced CLI1 at
players.test.mjs:657 before943 code, filed #945 and not fixed here. Final45/0 is
an actual different random-id run, not proof that the baseline flaw is resolved.

Strict legacy unknown/hibernate/first arbitrary heading/rounded states, changed
p/r/c and return, client claims/private fields, one lethal award and two real
controlled minute-alarm recovery steps are covered. #943 closes only this narrow
useful greeting family; #939/#931/#917 and post-turn944 remain open. Deployment
provenance and final rebase composition are recorded independently below.

#943 runtime c504cf1992a4ebff469aaa65a0af18db4f4c9c62 genuinely deployed in
Worker run38447595668/job115469916248: actual cloudflare/wrangler-action@v3
step SUCCESS, Uploaded/Deployed output18:33:10Z, version
`c4dcaba3-496a-4ca3-abd8-c50fc90d6654`. Raw job log/JSON and actual exits are
retained under `/tmp/lunden-priority-943/`; publication/final docs-only rebase
keeps all234 runtime/driver hashes and the original clean-grid producer/runtime
hashes exact. The bounded greeting slice is complete; parent939/931/917 and
post-turn944 remain separate/open. Owned Worker/browser/game-server processes
were stopped. This is genuine deployment evidence, not a live phone/World test.


### Bounded right/back greeting temple (#946)

Run `PLAYWRIGHT_MODULE=... CHROME_PATH=... node tools/riflerighttest.cjs
http://localhost:8878 http://localhost:8879 /tmp/right-greeting [GRID_PHASE_PROOF]`.
Default always measures. Explicit replay fails closed on complete producer
function or any production path/hash change, incomplete/failed matrix or negatives;
only an extracted clean grid phase is reused, never a failed whole-run verdict.

Original native1 measured all60 canonical styles/builds/heights, six first headings
0/.79/.8/.81/3.14/−1.6, actual Ghost held/saber/wave/repeat/6s-delayed/paused first
draw/first-state/late-welcome/suit and natural bind/head/breath pose updates:
197,678 rays,18,276 admitted nearestSkull,73,702 earlier unsupported surfaces,
66,104 FIRST pureSkull hidden forgeries,12,192 actual8corner contacts, zero
bad/cornerBad. Max entry/rounding residual3.123145mm under unchanged15mm guard.
Occluding arms/hair/face/nose/body remain present; the deliberately covered
z.055/.070 rows and oblique/outside cells are independently negative.

WHOLE native1 remains CLI1: the initial live test origin followed unrounded
target z, so real Combat r2 origin rounding could put d.z=0 outside the4mm band.
The fixture now uses an actually r2-aligned camera origin BEFORE lookAt, preserving
production rounding and its exact transmitted ray; no tolerance/policy change.
Native2 reused that clean measured phase, completed real protocol/HUD but whole
CLI1 on max sampler144/240 at fixed3m (1,152 corners,0 wrong corners);96 cases
had no admissible sampled packet. These logs/producer/failure facts are retained.
Bounded closer actual inputs subsequently prove all240 near-max cases at recorded
0.6m side origin,1,920 corners/0 wrong. Both coordinate signs and headings0/.8
cover all60 appearances. Every chosen distance/origin/r3 direction/hc is saved;
this is finite support, not all-range/coordinate coverage or a proven universal
explanation of the earlier3m sampler gaps.

Native3 returned23/CLI0. Final exact driver returns24 PASS/0 FAIL/actualCLI0,
zero errors/WebGL: fresh owned Worker after sourcefreeze, genuine Combat/Ghosts
2WS, head8 before greeting, head6 after, repeat delayed/capped-wave head4, public/
self HP, cached/version body3/2, one low-HP death/UUID/award/reset, replay no extra
effects, moved-returned body9, fresh greeted socket head8 and private-history-free
late welcome. A physical mesh0.01m before exact native contact, inside the old
0.3m clearance gap, blocks the entire actual world-obstacle ray. Nine captured
transmitted packets independently satisfy256byte/o:r2/d:r3/hc:r3. Actual HUD PNG
was inspected and shows real Huvudträff and measured protocol rows.

Separate `... OUTPUT --old-worker /tmp/old-config-5eab20e.js` returned6/CLI0.
Current real client→fresh OWN Worker intentionally importing exact older5eab20e
config: pre-greet head8, after-greet body7 with actual hc; inspected ordinary
Träff marker/HUD. Override hash/preboot order/listening PID and unchanged current
backend/client hashes are explicit, not a cached-module or external-service claim.

Focused right/recovery Node10/CLI0; combined right/front/players/recovery49/CLI0.
Node1 CLI1 was a misplaced raw-region crouch assertion: the unchanged shared
authoritative Contact crouch gate is now tested with the new named permission,
not a weakened crouch outcome or product change. Real room tests cover first
arbitrary heading, rate/invalid/client claims, immutable p/r/c changes/return,
legacy/private/hibernate/latewelcome, one lethal award and9/10 minute recovery.
Original broad grid is measured only in native1; later focused runs explicitly
reuse its source-bound phase. Artifacts/actual exits/grid extraction/full hashes/
raw packets/producers/PNG: `/tmp/lunden-priority-946/` and persistent946-proof.json.
Parents935/932/917 remain open. This is bounded actual native geometry/DOM/local
room evidence, not rendered World/phone/FPS/all-continuous-pose/full anti-cheat.
Final publication parity and genuine deployment are recorded separately below.

#946 runtime6bd8cc904f5810ee1090bcb47112d062ddeaa855 genuinely deployed:
Worker run38451685554/job115483907934, actual cloudflare/wrangler-action@v3
step SUCCESS, Uploaded/Deployed19:03:09Z, version
`224d8211-0329-4748-9c3d-8cb7f225a4ec`. Raw job JSON/log retained under
`/tmp/lunden-priority-946/`. Final docs-only rebase preserves all234 actual
runtime/driver hashes and the original clean grid producer/runtime hashes.
Owned Worker/browser/game-server processes stopped. Only this bounded immutable
right/back family completes; parent935/932/917 stay open for other families.
Deployment evidence is separate from live-phone/World/continuous-pose claims.

`tools/coldnativepathtest.{cjs,html}` (#715) verifies query-local native triangle chunks against actual Three0.170 Mesh.raycast. Supply saved external ≤16MiB `largest-geometry.json` as third argument. It retains original group order/overlap/integer triangle phase/final partial, indexed/nonindexed/normalized/interleaved data, Front/Back/DoubleSide, undersized authored boxes, negative/nonuniform matrices and exact object/worldpoint/normal/face/material/UV/uv1/barycentric metadata. Native timers mutate geometry/layout/index/Infinity range/material/ancestor/matrix/layer/dispose across yields; cancellation and shared-geometry all-occurrence/urgency/lifetime controls must fail closed. Builder callbacks are retained only for controlled cold-policy tests, with native clocks/deadlines; no World/phone benchmark or fake hit. Raw outcomes/source/input/probe hashes precede PNG. Reproduce with `PLAYWRIGHT_MODULE=... CHROME_PATH=... SHOTS=/tmp/cold-native node tools/coldnativepathtest.cjs http://localhost:8873 /path/to/largest-geometry.json`; existing `tools/combatcachetest.cjs http://localhost:8873 world` remains485 native regression. For #949, pass `--warm-only` instead of the geometry filename: this runs synthetic native geometry controls only (no captured Surface data or mutation-timer matrix). The unchanged448ebd9 reference must reproduce native0/cache256 after spatialReady; current must give0/0. The144 checks include pending/warm/disposed/rebuilt caches, override addition/removal before preparation and after path snapshots, actual original-mesh receivers/custom hit metadata, asynchronous positive/clear paths, later prototype overrides, shared geometry and existing raycast/getVertexPosition fallbacks. The485-check world fixture also passes. This establishes native hit parity, not World/phone performance.

### Bounded LEFT tiny-yaw acceptance (#947)

`tools/rifletinylefttest.cjs GAME_BASE WORKER_HTTP_BASE OUT` uses the original
Avatar/Ghosts/Combat and an owned fresh Worker without WebGL. `--room-only` reuses
a sibling `native/` pose phase only when its exact physical/profile contract and
native-function bytes match; it preserves that producer's whole result, including
failure. `--legacy-only` tests the new client against a separately frozen original
Worker rather than a cached module or external service. Worker bases omit
`/players`, which Ghosts appends itself.

Read-only feasibility on 5eab20e sampled all 60 appearances at .80→.81, .80→.79 and
both ±3.14 wrap directions: 41,040 actual first-surface rays, 63,456 independent
rounded-cell corner rays, zero wrong nearest surfaces/corners. Actual Ghost
first/delayed/paused/repeated wave, held/saber/suit and late welcome were used.
The old first-state counter compares against the endpoint heading; only its 60
late-welcome alignments are claimed. A first oversized negative matrix hit its
180-second owned browser-close bound, actual CLI1, with no completed counts.
The separate checkpointed .80→.81 negative phase completed 60 appearances and
12,960 rays: 3,930 FIRST-pure-Skull points behind observed hair (3,690) or arm (240),
3,930 paired full Contact evaluations with the new option disabled/enabled, zero
accepted in either, zero hidden LEFT candidates, and 240 actual translated
near-maximum contacts without mismatch. Other face/Nose categories and continuous
poses were not established by that limited negative matrix.

The first composed driver retained CLI1 after its native phase passed: its caller
supplied a `/players` URL, producing `/players/players` and no room receipts. The
corrected HTTP-base protocol and fresh post-#946-rebase protocol each completed
31 checks, actual CLI0, no page errors: unsent yaw-only quantum; genuine score-carried
normalized .01 state; local/public 2HP; paused/repeat/held/suit; late welcome;
one lethal UUID/award/reset; receipt replay; permanent .02-and-return rejection;
crouch; fresh socket; original packet cap/r2/r3. The inspected native HUD image
shows Huvudträff and actual receipt summary, not a rendered avatar/world. Its
undefined/undefined returned-head annotation reflects omitted body-only fields.
A separate fresh original 5eab20e Worker with the new client passed 12 checks/CLI0,
showing ordinary Träff and HP7 after tiny yaw. The real PlayerRoom Node suite
passed 32 tests/CLI0, including old-client missing-hc fallback, private history
bounds, malformed/legacy attachments, hibernation and permanent invalidation.

Artifacts: `/tmp/lunden-priority-947/`, with separate failed runs, source manifests,
checkpointed negatives, ordinary protocol/legacy JSON and inspected native PNGs.
All results are finite source-bound native/DOM samples; no World, physical-phone,
FPS or all-pose acceptance is claimed. Parents #935/#932 remain open for the larger
lateral remainder. Deployment and final publication parity are recorded separately.

#947 publication: runtime 9c4908440aadfa0e9b67eb5319926c8dc2761abd. Genuine Worker
workflow 38452843968, job 115487878261 and its actual
`cloudflare/wrangler-action@v3` step completed successfully (not skipped). This
confirms deployment, not a live phone/network match. Final Node32/CLI0 includes
an explicit resumed legacy attachment actual body1 assertion added after the
31-check browser completed. Its test-file hash delta is separate from the six
unchanged runtime/driver paths at that stage. A later #715 rebase changed only
`COMBAT.collision.nativeChunkTriangles`; all 21 rifle functions, PVP_RIFLE_HEAD,
AVATAR and GHOSTS remain identical to the green current-Worker baseline, and
final Node32 again passed. The original whole-config hashes remain their original
measurements, not rewritten final hashes. Reversing the two own runtime additions
reproduced the preceding published config/PlayerRoom, preserving #943/#946 and
all independent surface families. Parent #935 remains open for larger turns,
movement and crouching; no timeout can reopen this private corridor.

### Actual tiny-turn Front family (#944)
Serve the owned tree, then run `PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chrome node tools/rifleturnfronttest.cjs http://localhost:8870 http://localhost:8871 /tmp/rifle-tiny-turn`.
The actual native Ghosts matrix uses all60 canonical seed/style/build/height
combinations, four base headings, accepted r2 endpoints ±.02, intermediate
interpolation and capped paused first draws, held rifle/saber swing and actual
nearest skin faces. Independent forged FIRST pureSkull entries behind earlier
other surfaces and rounded-cell corner raycasts must stay safe. A180s finite
CPU budget retains a checkpoint per completed model; incomplete data is not
acceptance. The native driver starts and proves its own fresh Worker only AFTER
source freezing and geometry, avoiding stale modules and idle sockets.

The protocol carries .01rad using a genuine weapon change because unchanged
Ghosts.update does not publish yaw-only differences below .03. It verifies actual
Combat nearest-contact→serialized hc→Worker2HP, self/public life, body1, one lethal
kill/award/reset and replay, then the actual paused r2=3.14 Nose-first/deeperSkull
forgery must get body1 and returning inside the corridor must remain disabled.
Save raw receipts, source hashes, owned PID/socket provenance, actual exit and
original native HUD PNG. Node tests additionally cover endpoints, hibernate,
latewelcome and missing/null/malformed legacy history on supported rays. Preserve
all older greeting/core/nose/jaw/rear/lateral contracts; this is neither arbitrary
turn restoration, rendered World, phone/FPS nor full server avatar physics.

#944 measured matrix: 60 looks,126720 rays,11480 positives,29874 unsupported
nearest surfaces,24290 forged first pureSkull contacts behind earlier surfaces,
and7648 independent rounded-cell corners; all bad counters zero. The original
whole producers exited1 later in protocol scheduling; their complete source-bound
grid phase is measured evidence, not a successful whole run. The corrected
current-frame whole native run passed23 checks. After independent #946/#947 and
#715 integration, explicit `--protocol-only` passed19 checks with a newly started
owned Worker and235 exact source hashes; it does not rerun or pretend to replay
the older grid. All20 measured pure helpers and the original region/constant
projection are identical, and both private turn histories/options are preserved.

Final focused Node5/CLI0 covers own corridor and related histories. The complete
33-test suite actually returned32 PASS/1 FAIL: known #945 lateral greeting test
expects body on a contact within the already reopened fixed-left family. An
external deterministic UUID preload selects target00000002 (style3/build1/tall1);
identical inputs reproduce the same assertion failure on byte-loaded upstream
480e883 and this candidate. No side fix or complete-suite-green claim is made.
The inspected native HUD image shows the last body marker `Träff!`; its separate
receipt rows report the earlier head2/HP8, body1/HP7 and single fatal receipt.
No World, WebGL, phone, FPS or arbitrary-turn restoration was tested.

#944 publication: runtime e5ce50a90806d52060900824bf65a69c47d0ba54,
changelog755. Worker workflow38454099331, job115492225312 and the actual
`cloudflare/wrangler-action@v3` step completed successfully, not skipped.
Final fetched main has235/235 executed runtime/driver hashes identical to the
fresh integration run (owned Worker1875754 started19:18:11.634Z after freezing).
Only this final documentation changes afterwards; no extra broad grid is claimed.
This proves deployment and the scoped native contract, not a live phone match.
The full parent families939/931/917 remain open for larger turns and other poses.


#715 post-cold first-shot diagnostic: `nerfreciprocaltest.cjs --apartment --membership --post-cold-capture` preserves one real held-use/WS shot, captures first outcome before bounded membership/native oracle, then one actual manual World render+GL-finish and bounded CDP image. Requires an exclusive180s supervised slot and fresh source-frozen own Worker. Frozenfc7fd0b: actual Node/wrapper0,11checks; targettrue/clear391.5ms, server hit/hurt peer10→9. Registration-paused Scene is not ordinary running gameplay/FPS. The saved PNG is substantially covered by the real leaderboard name modal: loading/menu/rotate-only cover PASS does not certify unobstructed rendering. Preserve raw result and image, no rerun/second shot or phone acceptance. See issue715 validation README and `/tmp/lunden-priority-715-postcold/` for exact source/exits/provenance and remaining rendered/physical criteria.

### Combined greeting and tiny-turn Front (#955)

Run `tools/riflefrontcombotest.cjs GAME_URL WORKER_URL OUTPUT` with the usual
PLAYWRIGHT_MODULE/CHROME_PATH environment. It measures actual native Ghosts
push/draw/animate/wave/swing over all60 canonical appearances, four headings,
standing yaw endpoints, intermediate/capped first draws and before/repeated/late
waves. A finite300s geometry budget writes per-model checkpoints; timeout or
incomplete matrices fail. Independent earlier-other→FIRSTpureSkull forgeries,
eight rounded-cell corners and translated actual snapshots near coordinate limits
must remain safe. No WebGL or apartment is loaded.

A newly owned Worker starts after source freezing and geometry. Normal greeting
and a genuine saber→rifle publication carry the accepted .01 heading; no forced
prev/send state or modified thresholds. Actual nearest Combat contact must yield
2HP, self/public health, one lethal UUID/award/reset and replay; torso and legacy
remain body1, repeated greeting does not reset private history, a nearer actual
wall blocks the complete ray, and the paused large-turn Nose-first forged Skull
stays body1 after escape/return. Existing exact60/min score cap still applies.

The optional complete clean-grid proof is accepted only with exact measured
function/runtime hashes; it is explicitly a phase proof, not a rewritten original
whole outcome. `--protocol-only` is a scoped integration check with no grid
execution/replay claim. Preserve incomplete/failed runs and the separate known
#945 lateral fixture conflict honestly. Native HUD evidence is not World/phone/
FPS/all-pose physics. Publication results and genuine Wrangler are recorded below.

#955 actual whole native acceptance: all60 canonical appearances/four headings,
151200 rays,34440 actual nearest Skull positives/0bad,34042 earlier unsupported
surfaces/0false,23654 FIRSTpureSkull hidden-forgeries/0false,22960 eight-cell
corners/0bad. Near-max translated actual Ghost snapshots retained60 supported
models/480 corners/0bad. The300s geometry limit completed without timeout.
Whole native27/CLI0, no page errors or WebGL; owned Worker1895424 started
19:50:12.254Z after sourcefreeze and grid. Bounded monitor actual Node0 and
225.007s wall time; owned Worker/browser exited and all235 source hashes match.

Normal accepted greeting + saber→rifle carrying .01 yaw gave head2/HP8, torso7,
one lethal -1 UUID/award/reset/replay. Repeated ordinary greeting, actual nearer
wall, paused3.14 Nose-first forged deeper Skull body9, escape/return body8, legacy
body7 and exact60/min next-hit rejection all passed. The inspected HUD picture
shows the last body marker Träff! with separate earlier receipt rows; no avatar
render/World/phone/FPS/all-pose claim. Focused Node6/CLI0 plus recovery-related
Node8/CLI0; broader Node33PASS/1FAIL/CLI1 retains known945. Same deterministic
UUID00000002/input reproduces that old lateral expectation on unchangedfc7fd0b.
An intermediate expanded Node failure was an artificial61s test-clock jump
expiring an old shooter normally; independent fresh shooters corrected only the
fixture. That failed output is retained, not accepted as green.

Final rebase preserves incoming7296a9b changes only in verification.md,
docs/validation/issue-715/README.md and tools/nerfreciprocaltest.cjs; all235
executed runtime/driver bytes remain identical. No unnecessary broad-grid rerun
or rewritten old provenance is claimed. Deployment is recorded separately.

#955 deployed runtime557cff15da5cb596ff23a129bc5ee1efa613bc27, changelog756.
Worker workflow38458600007/job115507608002 and the actual
`cloudflare/wrangler-action@v3` step completed SUCCESS, not skipped. Final
fetch/rebase retained235/235 exact executed runtime/driver hashes; this final
commit changes documentation only. Deployment is not a live phone-match claim.
Only955 closes here;939/931/917 stay open for the orchestrator's explicit
criterion-by-criterion support/fallback audit.956 is not an automatic chain or
unrestricted positive requirement. No further functional issue is started.

#715 ordinary lifecycle companion `tools/nerflifecycle.cjs`: `nerfreciprocaltest.cjs --name-lifecycle-only` checks actual index/Leaderboard skip, session/reload, leaderboard/privacy modal covers and verbatim touch-start handler with declared collaborators, zero WebGL; all score/crash HTTP stays local/intercepted. Separate `--apartment --ordinary-gameplay` retains the normal main loop/frame/body, only adds source-bound frame/view-draw observations, and disables the fixture's duplicate World simulation timer/manual draws/effect freeze. Real UI handlers must release all measured role/modal covers. Natural reciprocal confirmation/lives/rates/effect assertions remain; require one newly granted supervised180s World invocation and fresh source-frozen local Worker, not native/UI or phone/FPS acceptance. See issue715 validation README for headless warm-up and timing limits.


#715 ordinary attempt on2c700323: real UI releases22covers; original loop40actualviewdraws and two actual Worker/WS hit+hurt receipts each bring both peers10→8. Firstsend targettrue/clear305.9ms (active89.8/yield216.1/cache0), before any post-outcome copy/hash/oracle. WholeNode1/wrapper1/no timeout77.462s,20PASS/1FAIL, noPNG: final exacttwo-groups/four-visible-mesh guard from paused fixture is inappropriate under legitimate moving-detail layer7 and natural remote expiry/frustum. Preserve raw failure; no product bug, ordinary rendered image or phone/FPS acceptance is inferred. Source inventory1350=1349tracked+1explicitcompanion matches, all nine owned processes/profile/HTTP/Worker cleaned. Next actual screen-effect callback observation is proposed separately, not executed here.

### Front parent criterion audit (#939 / #931)

The criterion audit after943/944/955 separates positive support from deliberate
body fallback. Original931/history14 proves useful fresh pre-greet head2 and
actual paused3.14 Nose-first forgedSkull body1.943 native21 proves immutable
after-greet head8/6/4, repeated delayed/capped waves, latewelcome and real fresh
socket.944 whole native23 and final focused19 prove useful ungreeted tiny turn.
955 whole native27 proves the combined accepted greeting+turn, nearer actual wall,
self/public health, ONE lethal UUID/award/reset/replay and exact60/min cap; its
large-turn-proof retains actual Nose first→forgedSkull body9 and return body8.

| Source-bound measured phase | Positive | Earlier unsupported | FIRST hidden Skull | Cell corners |
| --- | ---: | ---: | ---: | ---: |
|943 all60/four first headings,146655 rays |21608 |38090 |33035 |17216 |
|944 all60/four headings,126720 rays |11480 |29874 |24290 |7648 |
|955 all60/four headings,151200 rays |34440 |34042 |23654 |22960 |

All recorded bad counters are zero.955 additionally measures60 near-max
translated actual Ghost snapshot contacts/480 corners/zero bad. These are
finite sampled held/saber/wave/intermediate/capped-pause matrices, not World/
phone/FPS/all-continuous-pose physics. Earlier failed whole producers for943/944
remain failed, with clean geometry phases explicitly hash-bound and separate from
the successful protocol run.955 itself is actual27/CLI0,225.007s/no timeout.

Three compatibility claims are distinct: actual943 browser contact-less cached
client packet gives body1; actual943 version2 hc gives body1; a SMALL actual
Node Worker/PlayerRoom historical-validator control adds10/CLI0 current and
10/CLI0 historicalfc7fd0b. It uses the EXACT saved955100byte wire, deterministic
server appearance, complete normalized p/r/h/score/c/sp state and ordinary
greeting/weapon transitions; no private history injection. Current gives
head2/HP8, preceding validator body1/HP9; both independently keep contactless and
version2 body1 and correct late public HP. An explicit loader substitutes only
byte-hashed historical players.js/config.js; remaining actual runtime and
installRuntime/fakeNamespace transport are current. This is not another browser,
physical cache or live deployment test. Audit artifacts: /tmp/lunden-priority-939-final.

Actual recovery-related PlayerRoom Node8 uses a controlled alarm clock; no live
minute timing is inferred.955 focused6 includes hibernate/legacy/endpoints and
move/crouch/escape+return/client-forged permission body9. The broader955 Node
33PASS/1FAIL/CLI1 is known outside945, deterministically reproduced on unchanged
upstream; no complete-suite-green claim. HUD images were inspected:955's final
visible marker is BODY Träff!, with earlier actual head8/lifecycle receipt rows.
Genuine Wrangler success jobs are115469916248/115492225312/115507608002.

Source audit on2c700323: Avatar byte-identical since943/944, eight pure shape/
Front/contact helpers and13 relevant policy constants identical; AfterTurnFront
helper identical since944. Latest955235/235 runtime/driver hashes match. Older
whole config/PlayerRoom hashes are NOT rewritten as identical: independent named
permissions/history/surface additions are composed explicitly. No new runtime,
geometry, wire, policy or tests in the repository change for this audit.

Closure proposals are separate:939's useful bounded after-greet/turn/combined
criteria and safety are met;931's declared Front support/precision/nearest/
obstacle/lifecycle/compatibility/deployment matrix is met with the stated body
fallbacks.917 and broader/lateral/rear parents remain independent and open.956
is not an automatic prerequisite or an invented arbitrary-turn/allpose claim.

### Bounded larger standing LEFT family (#953)

`tools/riflestandinglefttest.cjs GAME_BASE WORKER_HTTP_BASE OUT` uses actual
Avatar/Ghosts/Combat and an owned fresh Worker, with bootstrap/WebGL suppressed.
`--normalized-only` evaluates twelve disjoint five-model chunks, all 60 canonical
appearances and every 61 accepted base 0.8 r2 offset from -0.30 through+0.30.
Five actual interpolation, endpoint, capped paused draw, repeat and saber phases
completed 18,300 nearest-Skull/shared-Contact positives and 146,400 independent
rounded-cell corner rays, zero earlier surfaces/corner errors, actual CLI 0.
Checkpoints and source manifest are retained. This is a finite point/phase matrix,
not every continuous animation or arbitrary history.

Separate targeted negatives: +0.30 produced 25,920 rays and 9,155 FIRST-pure-Skull
forgeries behind hair 6,755/jaw 2,400. A +0.10 facial/arm matrix produced 17,280 rays
and 4,649 behind Nose 1,920/face-neck 720/arm 2,001/hair 8. An actual reverse arrival
from visible -0.30 to accepted+0.30, retaining old geometry before its next draw,
produced 17,280 rays and 3,389 behind hair 779/face-neck 1,170/Nose 1,440. Every forged
point was evaluated with the new option disabled and enabled: zero accepted in
either. Actual translated near-maximum contacts passed in each phase. All three
finite probes had CLI 0, frozen sources and zero WebGL; category counts remain
separate, and zero candidate-hidden cells are not substituted for full Contact
calls. Both wrapped headings±3.14→∓2.85 separately completed 600 positives/4,800
corners over all 60 appearances, CLI 0. These limited probes do not establish every
ray direction, extreme world coordinate or continuous pose history.

The scalar+0.30 producer retained whole CLI 1: its copied tiny-family assertion
incorrectly required 60 physically blocked RIGHT samples. Actual LEFT data were
10,260 rays/0 bad,16,512 admitted corners/0 bad and support in all 60; actual
rightBlocked was 0 at this pose. The new driver separates LEFT acceptance from that
obsolete physical RIGHT expectation; its identical pose-function/physical contract
reuses the source-bound LEFT phase without rewriting the original result, exit,
hashes or observations. Actual canonical RIGHT representative contact still
received body 1 in the current Worker, with the rotated r3 wirepoint recorded.

Fresh current-Worker ordinary protocol 31/CLI 0 and post-#955-rebase protocol 31/CLI 0
cover normal yaw-only 0.30 publication, self/public 2 HP, paused/repeated wave and
held/suit/score, late welcome, one lethal UUID/award/reset, receipt replay,
0.31 escape/return, crouch and fresh socket. Original capture's undefined returned
head captions are presentation omissions, not proof: receipts 7/8 show missing
head normalized false, HP 9/8 and actual hc. The inspected post-rebase native HUD
prints those values explicitly and shows the genuine Huvudträff marker. It is a
DOM receipt image, not a rendered avatar/apartment. The directly affected older
`rifletinylefttest` keeps its actions and now expects the legitimate wider2 HP at
0.02/return; its scoped current room 31/CLI 0 passed, while Node still checks the
original tiny history stays permanently false. Final pre-rebase Node 35/CLI 0;
post-#955 Node 36/CLI 0, including all normalized history quanta, reversals/wrapped
aliases and independent Front/tiny histories. No unrelated #945 test assertion
was modified or hidden.

Artifacts: `/tmp/lunden-priority-953/`, separate normalized/scalarCLI 1/negative/
wrap/current/old-tiny/source manifests. No World/GPU/physical-phone/FPS claim.
Parents #935/#932/#917 remain open. Original Worker fallback, publication parity
and actual deployment evidence follow separately.

Final #953 compatibility/parity: a fresh owned historical fc7fd0b Worker (external
immutable config/PlayerRoom loader, started after its source manifest) with the
new client completed 12 checks/CLI0: before greeting head2/HP8, after ordinary
larger yaw body1/HP7 and genuine Träff marker. Current post-rebase seven
runtime/driver paths match their run manifests exactly. Both normalized and scalar
pose functions match their original producer copies; no old result/hash/exit was
rewritten. All head/Avatar/Ghosts/Combat constants and 21 of 22 rifle functions match
the geometry producer. The explicit exception is the shared wrapper's independent
published #955 greeting-after-turn Front option; its leaf/history were preserved,
and fresh current Worker 31 plus Node 36 were rerun after integration. Reversing only
the two own runtime additions reproduces preceding published config/PlayerRoom
exactly, including independent Front/RIGHT/tiny state and callbacks. Deployment is
recorded separately after the actual workflow step succeeds.

#953 deployed runtime: ccfa77aaeec5ed7d0ec03266d0a3e2eb5eefe01e. Genuine Worker
workflow 38462027300/job 115519360550 and its actual
`cloudflare/wrangler-action@v3` step completed successfully (not skipped),
independently checked by the orchestrator. All seven final runtime/driver paths
match the post-rebase current Worker proof exactly; final intervening #715/#939
changes were only preserved document appends. This establishes publication of the
bounded contract, not a live match, physical phone, World render or all-pose claim.
Original scalar whole CLI1, source-bound chunks and scope limitations remain
unchanged. Parent #935 and its larger/RIGHT/moving/crouching remainder remain open.

#715 `nerfreciprocaltest.cjs --screen-callback-preflight`: actual toys/Scene/camera Mesh objects, synthetic onAfterRender invocations with an explicit fake renderer,20checks/actualCLI0/noWebGL. Tests exact prior callback chain/return/throw/descriptor restoration, first-checkpoint gate, screen/main-camera/Scene/geometry/material/visibility/layers rejection and bounded local/incoming body/tip data. `--apartment --ordinary-gameplay` now observes actual main-camera/null-target submissions only after first-send checkpoint, replacing inappropriate simultaneous final-pair expectation. Draw submission is not pixel visibility/occlusion proof. Ready/uncovered natural canvas image is independent and may complete while effects logic/wholeCLI fail; no update/render/TTL/culling override. Originalfailed30151e9 preserved. Requires separately reviewed exclusive180s World grant and fresh source-frozen owned Worker; native controls alone certify no World/phone/FPS behavior.


#715-screen actual ordinary run d4b8fc8: first targettrue/clear297.6ms(active88.2/yield209.4/cache0), real2WS twohit/twohurt each/bothHP8. Checkpoint35normaldraws/actual warmStateskipped/all22coversreleased. Four actual local BODY/TIP main-camera/null-screen-target submissions from two flights, zero observed incoming;23checks22PASS/1FAIL. Independent ready/uncovered natural CDP canvas capture then times out15s: logicfailed/imagesfailed, noPNG, wholeNode1/wrapper1/no globaltimeout87.587s. Draw-submission is not visible-pixel/FPS/phone evidence. Exact1351pathfreeze, freshWorker1923208/PID/startticks/tcp+tcp6 ownedlistener; all nine owned processes/profile/HTTP/Worker cleaned. No retry, product/cull/TTL/quality/budget change. Concrete next native incoming first-step/camera-crossing/age diagnosis is proposed, not executed here; physical phone and successful canvas criteria remain separate.

### Immutable Rear after greeting (#951)

`tools/riflereargreetingtest.cjs` exercises the actual unchanged Three SkinnedMesh,
Ghost push/draw/wave/swing and Combat/Worker path without an apartment or WebGL.
Run against a separately started, freshly source-frozen owned local Worker:

```sh
node tools/riflereargreetingtest.cjs http://localhost:8876 http://localhost:8877 /tmp/rear-greeting --matrix-only
node tools/riflereargreetingtest.cjs http://localhost:8876 http://localhost:8877 /tmp/rear-room
node tools/reararmtest.cjs http://localhost:8876 http://localhost:8877 /tmp/rear-arm
node --test cloudflare/players.test.mjs
```

Use the verification environment's explicit `PLAYWRIGHT_MODULE` and `CHROME_PATH`;
`--legacy-only` exercises the actual new client against a separately archived and
freshly started pre-951 Worker. Matrix/browser limits are finite (900/180 seconds),
with completed five-model checkpoints saved before the next chunk.

Own source-bound read-only baseline on d4b8fc8: all 60 canonical appearances, four
accepted r2 first headings (0/.8/3.14/−1.6), 12 actual first/wave/capped-pause/repeat/
held/saber/idle/late-welcome phases, 43,200 rays, 14,688 admitted Skull-first contacts
and 117,504 independently raycast cell corners, zero wrong/corner contacts.
10,800 FIRST pureSkull entries behind observed earlier long-hair surfaces all
failed the full contact check; max admitted first-entry residual 10.325 mm is
below the unchanged 15 mm guard. Join/no-default, first state and late-welcome
body alignment each cover 240 cases. The four executed geometry/animation paths
remain byte-identical; the committed matrix function matches that producer.

A separate centre-Y oblique grid retains whole CLI1: 6,000 rays, 2,282 admitted
contacts, 18,256 corners and 1,500 rejected deeper hair claims with zero safety
mismatches, but two short/narrow models admitted no centre-Y positive. A disjoint
two-model broader-Y supplement returned CLI0 with 600 rays/100 admitted contacts/
800 corners and no mismatch. Its launcher initially had an ENOENT typo; that
failed attempt is retained. Neither original counts nor exits are rewritten.

The unchanged genuine 0 → 3.14 paused Ghost `reararmtest` passed 10 checks both
before and after the candidate gate: actual elbowR precedes FIRST pureSkull, the
original client rejects its head tag, a real serialized deeper proof receives
body1/HP9, and one body death/award/reset/replay remains unchanged. This explicitly
contrasts immutable permission with changed-heading rejection.

Candidate current-room fixture: 25 PASS, actual CLI0, owned fresh Node born after
a recorded source-freeze BOOTTIME, IPv4/IPv6 listener checks and exact runtime/
driver freeze. Genuine immutable pre/greet/paused/saber contacts give HP8/6/4/2;
a legacy missing-hc shot leaves HP1; one lethal head gives HP−1, one UUID/award6
and normal receiver reset, with replay-safe effects. A real late observer has
body=first public heading and no private flag. Ordinary heading, position and
stance changes/returns give body1 (HP9/8/7); native wall/miss cause no hit or
award, invalid hc version gives body1, and real r2/r3/v1 packets remain ≤256 bytes.
Both the actual head and final body marker PNGs were inspected. The fresh archived
d4b8fc8 Worker/new-client compatibility probe returned 6 PASS/CLI0: pre-greet
head2/HP8 but greeted immutable actual hc still body1/HP7.

Node returned 37 PASS/CLI0, retaining named/positional/default/null and unrelated
branches and adding changed p/r/c return, unknown/malformed legacy, hibernation,
healing/death, fresh socket and private snapshot controls. The directly affected
older Rear Node case retains first state/greeting actions, updates immutable
post-greeting head2 and then performs an actual heading change/return before its
permanent body1 checks. No #945 expectation is altered.

First candidate protocol retains actual CLI1 (completed=false): earlier current
HP/death/heading checks passed, then the fixture incorrectly indexed Vector3.p[0]
and timed out; the corrected predicate uses p.x. Original output, sources and
exit remain separate. All raw producers/results/PNGs/provenance are saved under
`/tmp/lunden-priority-951`. These are finite source-bound samples, not all
continuous poses, physical phone, World, FPS, server-side full skin physics or
changed-history restoration claims. Parents #941/#936 stay open.

#951 published runtime: e981213dd7d9d5f73e9a67167ababd8ff862eeea. Genuine Worker
run 38467670943 / job 115538518672 completed successfully; the actual job log
contains `Run cloudflare/wrangler-action@v3`, `Uploaded lunden-l1007` and
`Deployed lunden-l1007 triggers` (step arrays returned empty, so the saved log is
the step evidence). This is deployment evidence, not a live phone/World probe.
All six executed current runtime/driver hashes match both this commit and the
format-only 3e718ecc3bcf3851254d5f21bbd39e6b9515b9e4 follow-up.

The initial publication inadvertently expanded compact changelog entries. The
immediate format-only follow-up restores exact pre-951 bytes after removing only
new entry758, preserves all 756 older entry values and unique descending IDs,
and the actual historical/current `changelog_stamp.id_times` comparison preserves
every older timestamp. Entry758 uses the runtime commit time. No published
history was rewritten; these checks prevent older entries being marked “Nytt”.
The failed oblique/protocol/launcher exits and reconstructed first-producer mtime
remain separately documented. #941/#936 remain open for other pose histories.


### #715 real incoming WS/selected first-step native replay

Use `WORLD_REPLAY_REFERENCE=/absolute/saved/world/result.json SHOTS=/tmp/output node tools/nerfreciprocaltest.cjs http://localhost:8878 http://localhost:8879 --incoming-step-replay` with the installed Playwright/Chromium environment. Start a fresh owned local Worker after source freeze and verify PID/start ticks/listening fd through both tcp/tcp6 before Node; local-only routing intercepts public score/crash POSTs. Explicit reference poses/launch/camera are inputs, never instructions. This native mode uses actual Ghosts/Combat/Blaster, unversioned Nerf WS packets and original Darts.update; .005/.010/1/60/.033/.050 are selected inputs, not measured earlier World dt. The actual main cap .050 is source-checked. Original4s wall expiry is a separate real delayed zero-step control, without born/TTL reset.

Measured native5: actual Node0/13checks, six real hit/hurt receipts, HP 10→4, zero WebGL. Slow steps remain eligible;1/60 leaves the native frustum before camera crossing, .033/.050 cross behind while unexpired, real wall expiry independently hides the final effect. This does not measure screen-render/pixel/occlusion/FPS or establish the earlier missing incoming submission's cause. `/tmp/lunden-priority-715-replay/` preserves native1–4 whole CLI 1 (cadence/report failures), native5 JSON/upper-readable but lower-clipped text PNG, and exact runtime/tool/backend proofs. See the issue715 validation README for counts, transport spacing, source-freeze composition and unresolved hardware/user criteria. No runtime/culling/TTL/budget/quality change or new World attempt is included.


#715 `tools/nerfnormalstep.cjs` / `nerfreciprocaltest.cjs --normal-step-preflight` records real incoming birth/input and **actual first natural-rAF** original Darts.update dt, age and pre/post current-transform native sphere eligibility. Two real local Worker/held-Nerf peers, original source-checked single Three.Clock read/.05 cap,19controls/actualCLI0, HP10→9, zero WebGL. Exact method this/arguments/return/throw/own+inherited descriptors/restoration and full-source guards precede the native DOM PNG. No selected dt or World/frame/render claim; earlier World input remains unknown. The existing ordinary served observer now records its single original raw clock value before unchanged frame and snapshots first incoming steps before image/failure. Its two additive hooks reverse to exact main bytes; missing native spheres/overflow are explicit. This integration is source/native verified but requires a separately approved actual World run. No new heavy run/capture retry/TTL/physics/runtime change in this slice. See [native natural-step observations and source limits](../validation/issue-715/README.md#actual-native-natural-first-incoming-step-2026-10-14).

## Freezer head-hit summary (#958)

`PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/usr/bin/google-chrome node tools/freezersummarytest.cjs http://localhost:8875 /tmp/lunden-freezer-summary-surface/final` checks the actual index DOM, production loader/list and actual `buildNote`/`refresh` paper canvas without World/WebGL. It verifies one explicit head-hit summary and one plain Nerf optimization summary (unrelated Nerf features stay separate), unchanged originals and every unrelated row, grouping before the 100-row limit, idempotence/unknown groups, publication order when a newer group member has a lower id, old seen-id migration, first/return visits, raw offline cache parity, monotonic seen ids with partial cached history, texture disposal and actual canvas text/New stamp. The existing full-world `notetest.html` expected display/New counts now use the grouped presentation; its world/action tests were not rerun for this isolated presentation change.

The focused final Map-based run passed all 23 assertions with actual CLI 0 and no pageerrors or WebGL contexts. Its real 300×420 paper image was inspected: the summary appears once, technical head-hit and Nerf optimization text is absent and unrelated news remains. Artifacts and source hashes are retained under `/tmp/lunden-freezer-summary-surface/`; historical publication-time equality is checked separately using `tools/changelog_stamp.py`. Future head-hit entries use `group: "head-hits"` and Nerf optimizations use `group: "nerf-improvements"` as documented in CLAUDE.md. No gameplay, physical-phone, full-world or FPS certification is claimed.

### Covered viewport allocation reduction (#669, 2026-10-14)

`PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/coveredviewporttest.cjs GAME_BASE OUT`
loads actual index CSS, Three r170, viewport, crash reporting and phone restore
handlers with bootstrap suppressed. A tiny genuine WebGL box replaces the apartment;
main's cover/defer policy is executed verbatim and its timed pre-simulation flush
hook is source-checked. The original native probe returned11 checks/actual CLI0;
current driver21/actual CLI0, no page errors, and inspected portrait/landscape PNGs.
Original transition:3 resize calls/6 canvas dimension writes; candidate:0/0.
It checks startup, warming, first view, shot, desktop, legacy default binding,
latest uncovered dimensions before resize-rAF, unchanged quality ratio and disposal.
An explicitly synthetic hidden-state control checks pending visibility/pageshow
catchup; it is not actual Safari background evidence. Forced actual WebGL loss/
restore retains both actual local-intercepted CrashLog POSTs and one original
guarded reload callback. It does not reproduce or prevent the reported iPhone loss.
Source manifests precede the run; assertions/results precede required PNG captures;
raw exits and images: `/tmp/lunden-crash669-new-surface/{baseline,candidate}/` and
`baseline-cli.txt`/`candidate-cli.txt`. The initial server-read race returned curl7
before the listener was ready; the later verified listener and native run succeeded.
No World, phone, rendered combat, FPS benchmark or quality rollback acceptance.

### Small-yaw Rear after greeting (#952)

`tools/rifleturnreartest.cjs GAME WORKER OUTPUT` uses actual Ghosts, Avatar,
Combat, native HUD and two local WebSockets without apartment/WebGL. Start a
separately source-frozen owned Worker (`node cloudflare/dev.mjs PORT`), then run
with the verification environment's `PLAYWRIGHT_MODULE` and `CHROME_PATH`.
`--legacy-only` targets an independently archived pre-952 Worker; `--matrix-only`
runs the finite native first-surface grid described below.

Saved original feasibility: 60 appearances, 17,280 rays, 9,792 Skull positives
and 78,336 corner casts, no mismatch/errors/GL and unchanged five source hashes.
The historical process exit was not saved and is **unknown**. Its 4,320 deeper
negative candidates used the analytic skull entry; its saber phase explicitly
cleared `waveT`, so it does not prove natural wave completion. The additional
native first-surface grid uses actual earliest all-Skull triangles behind closer
unsupported surfaces: 51,840 rays, 10,992 positives, 87,936 corners and 12,960
rejected deeper claims, zero safety mismatches/errors/GL, all 60 completed.
Its whole **CLI1** remains: six short models have no positive at middle-Y, while
outside-Y samples stay unsupported. A disjoint six-model broader-Y supplement
passes **CLI0** with 5,184 rays, 1,668 positives and 13,344 corners. These grids
include interpolation, old/changed headings, opposite-endpoint late observers
(.04 rad span), wrap-boundary anchors, capped pauses, repeat and held/saber
transitions; the added grid advances the actual wave before saber. A translated
near-limit check at feet [4996,0,4996] passes **CLI0** across all60: 5,400 rays,
1,770 positives, 14,160 corners and 1,350 rejected native deeper claims, zero
mismatches/errors/GL. The first translated attempt remains **CLI1**: its camera
was not translated, so Ghost distance culling prevented first-pose alignment;
its static intersections are not accepted as animated-pose evidence.

Current native room: **25 PASS/CLI0** on a Worker independently born after freeze,
with owned IPv6 listener and ten unchanged source hashes. A normal equip change
lets Ghosts publish the small .01 yaw (below its standalone delta threshold).
Pre/greeted/paused/saber shots give HP8/6/4/2; a missing-hc shot gives HP1; the
next lethal shot gives one UUID/award and normal reset. Larger yaw escape/return,
position and stance changes give body1, with unchanged wall/miss/version/wire
and replay behavior. Both final native head/body marker PNGs were inspected.
The unchanged actual paused-arm fixture passes **10/CLI0**, with elbowR
2.628565 m before the 3.004972 m skull entry and real Worker body1/HP9.
A fresh archived `78344067` Worker/new-client probe passes **6/CLI0**: its
greeted .01 yaw still gives body1/HP7. This is compatibility evidence, not a
live-deployment claim. Its native receipt PNG was inspected.

Focused Node authority/API/history/recovery cases pass **5/CLI0**. The whole
Node run retains **37 PASS/1 FAIL/CLI1** at the existing #945 lateral expectation;
that test is untouched. The directly affected older Rear escape controls now
use .03 rather than newly supported .01 and retain their original other actions.
Earlier attempts remain separate: first Node CLI1 at that old Rear expectation;
first protocol CLI1 waiting for an unpublished sub-threshold yaw; protocol2
25/CLI0 but invalid born-after-freeze provenance because the shell reused its
PID; an initial archived-Worker launch CLI1 omitted a required schema module.
All raw sources, actual exits, results, receipts and PNGs are retained under
`/tmp/lunden-priority-952`. These are finite samples, not all continuous poses,
full server skin physics, rendered apartment, physical-phone or FPS evidence.
Parents #941/#936 remain open for larger/other changed histories.

#952 runtime published as `83ac60fb7e06327ec1539ed89849804b8b925122`. Worker
run `38520979243` / job `115710346474` completed successfully; its actual log
contains `Run cloudflare/wrangler-action@v3`, `wrangler deploy`,
`Uploaded lunden-l1007` and `Deployed lunden-l1007 triggers`, version
`ce6d955c-ff90-436e-981e-a15d5ff1a100`. All ten executed source paths match
the published commit. Removing only grouped changelog761 reproduces the exact
previous file bytes; all759 older entry publication times remain unchanged
under the actual `changelog_stamp.id_times` implementation.

#715 `nerfreciprocaltest.cjs --apartment --ordinary-gameplay --first-incoming-only` is an exclusive ONE-use-per-peer ordinary-loop diagnostic that returns after first original incoming update, before rounds/images. Requires a fresh frozen own Worker and separately approved external160s single heavy run; **no PNG/capture attempts**. Code/mode controls `--first-incoming-controls`16/CLI0 check exclusivity, source reversal/single clock read and early checkpoint/bypass structure without browser/World. Actual frozen be435ee first incoming records raw6.66/cap.05, age4748ms>original4sTTL: it expires before motion, not camera crossing. Actual local targetfalse/null/traversal deadline/cacheWait0 remains gameplayFAIL. Preserve diagnostic child9/CLI0 separately from **whole supervisor1/timeout160/SIGTERM/161.431s**, complete raw source/cleanup evidence, zero submissions and HP9/10; no false bounded-run PASS or phone/hardware/render-visibility claim. Temporary layer masks are not proof of exclusion at actual main render passes. No retry. [Exact first-step/raw exit evidence](../validation/issue-715/README.md#first-incoming-step-in-the-original-ordinary-world-2026-10-14).

### Immutable central Nose depth (#950)

`tools/riflenosedepthtest.cjs GAME WORKER EXTERNAL_OUTPUT` uses actual Ghosts/Avatar/Combat, the original native closest-triangle raycasts and a fresh owned local Worker. `--matrix-only` records every model and positive contact; `--entry-matrix` independently compares prospective FIRST Nose-profile depth contacts with actual nearest surfaces and all eight rounded-cell corners, including first-far bind. `--legacy-only` requires a separate newly started original Worker; it does not reuse module caches. No apartment renderer or WebGL is constructed.

On83ac60f plus the additive950 patch, the final nearest matrix passed15 checks/CLI0: all60 canonical style/build/height models,115200 rays,1860 new accepted Nose cells and14880 independent corners, no wrong surfaces/corners, maximum original-entry residual4.64655mm within unchanged6mm. Sixteen appearances have zero new positives in this finite grid; none are forced to pass. The separate final current-policy entry matrix passed15 checks/CLI0: 13624 prospective accepted new-family cells, 108992 corners, zero non-Nose/residual/corner errors. These finite four-yaw first/late, wave/repeat/capped-pause, held/saber and idle samples are not all continuous poses.

Fresh Worker2168532 started in a separate completed command after `protocol3-source-freeze.json` and is bound by PID/start-ticks/socket-FD/proc tcp+tcp6 evidence. Actual protocol3 passed24 checks/CLI0: shared HP8/6/4/2 for supported ordinary shots, one lowHP death/UUID/reset, receipt replay, permanent body1 after accepted heading/move/crouch changes and returns (HP9/8/7), wall/miss, unchanged serialized precision/cap, zero page errors and zeroWebGL. Inspected real DOM images show the actual Huvudträff and Träff markers with readable measured receipt rows. A separate fresh original83ac60f players/config loader Worker2169393 passed5 legacy2 checks/CLI0: the new client receives body1/HP9 and its ordinary replay-safe marker. This establishes local native/Worker compatibility, not live-device, World or phone/FPS behavior.

Focused current Node authority/history/default/null/bool/malformed-option and incoming952 tests passed4/4 CLI0. The full PlayerRoom/recovery run was44/45 CLI1: the sole pre-existing failure is issue945 at players.test.mjs:657 (lateral greeting expectation), which this change does not edit. Original failures remain recorded: the exact-FIRST-only supplementary probe had zero new depth candidates and CLI1 (an insufficient sampling design); protocol1 passed gameplay checks but CLI1 because its final body-marker image was delayed until after wall/miss and the marker had expired. Protocol2 moved only that image checkpoint immediately after the real body hit.

Artifacts remain under `/tmp/lunden-priority-950/` and the orchestration ledger. `source-parity.json` reverses only950 additions to reproduce full upstream config/avatar/players bytes. `physical-source-parity.json` confirms11 pre-existing Nose/Jaw/profile/look helpers and old Nose constants/profile match the original feasibility78344067. Protocol2's measured driver SHA26afd7b5fc639c6822d54b0cf496b27e0bc6c219690b499944f4d8b6298f319d is preserved by an exact reconstruction: later matrix-description corrections and the separate entry-matrix branch change the file hash, while the two-page gameplay protocol is byte-identical. Each subsequent matrix/legacy run has its own current-driver freeze. No partial/failed execution is relabelled green, and broader Nose issue920 remains open.

The earlier protocol2/legacy gameplay runs retained their actual CLI0, but their shell PIDs had started43/60ms before the freeze commands and then exec-ed Node. They therefore do not satisfy the strict kernel-PID-after-freeze provenance criterion. Protocol3 and legacy2 repeat only the ordinary acceptance with independently started post-freeze processes and affirmative recorded start-tick comparisons; current driver/runtime hashes are exact for these final runs.

#950 publication: runtime `de76686daf4737997f3cd76045f203a0c8b91e75`, grouped head-hits changelog762. Worker run38522572126 / job115715427924 executed the genuine cloudflare/wrangler-action successfully on that exact SHA at2026-10-14T06:30:21–41Z; its log contains actual `npx wrangler deploy`, Uploaded/Deployed lunden-l1007 and version7fd414ea-12b9-4073-ad8c-f1cfe2af81fe. All six measured runtime/driver paths from protocol3 and final-entry match the published commit byte-for-byte. This closes the bounded950 family; broader920 and movement/crouch families remain open. The completion commit changes only this acceptance record.

#923 read-only eyebrow/mouth audit ([measured source/cells and limits](../validation/issue-923/README.md)) verified exact original36-vertex box ranges on sampled actual Avatar native rays without World/Worker/WebGL.12 style×build looks and5832 rays expose927/921 brow and24 mouth contacts;200 attempted whole-cell corner rays retain116 wrong-family corners. One whole-cell candidate per s=-1/+1 brow and mouth does not confer server support or all-pose/quantization acceptance. Separate12 nearest negatives include actual hair/hat/eye/nose/torso and a miss. Initial fixture/reporting CLI1s retained; corrected survey and negative Node0, source1357/1357, native DOM summary PNG inspected with QR/right-edge clipping explicit. Full functional children [#963](https://github.com/solwation/lunden-3d-apartment/issues/963) and [#964](https://github.com/solwation/lunden-3d-apartment/issues/964) must each provide exact pure/native geometry, conservative actual nearest support, real Combat/Ghosts/Worker2HP/HUD/death/history/precision/recovery and genuine deployment before closure. No runtime change or automatic child start.


### Exposed front-side Jaw strips (#959)

`tools/riflejawstriptest.cjs GAME WORKER OUTPUT GEOMETRY` uses the actual Avatar,
Ghosts, Combat and a separately started local PlayerRoom. The all60 native grid uses
source-derived breath/head-pitch extrema plus actual held, wave, paused/repeat,
saber, turn and changed-history controls: 43,740 nearest-surface rays, 9,488
admitted Jaw contacts, 7,200 rounded whole-cell corners, zero false admissions or
corner failures, and maximum entry residual 6.787 mm under the unchanged 8 mm
limit. The unsupported/deeper/ahead/miss controls remain separate; this is finite
sampled coverage, not every continuous pose.

The final fresh-Worker room passed30/CLI0 with a recorded PID born after the source
freeze and no WebGL: one body1 shot, four new 2-HP Jaw receipts, old-classifier body1,
one lethal UUID/award/reset, replay idempotence, marker, real wall and miss, and the
existing r2/r3/v1 wire bound. The final actual HUD/receipt PNG was inspected. Focused
`node --test cloudflare/players.test.mjs` passed40/40 including authority, normalized
history, hibernation, old-client and late-welcome cases. Earlier whole candidate and
room attempts remain recorded separately as failures; only the narrowed .037–.040
leaf is accepted. No apartment, full animated-scene physics, live phone or FPS claim.

### Chat continuity in short layouts (#966)

`PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/chatcontinuitytest.cjs GAME WORKER EXTERNAL_OUTPUT`
uses actual Chat/Ghosts, production index DOM/CSS and two independent browser pages
with real local Worker WebSockets. It suppresses bootstrap and forbids WebGL; it
is not apartment rendering or physical-phone acceptance. Desktop1280×1000 and
short-phone390×300 plus landscape667×375 exercise chronological rolling rows,
plain text, individual elapsed60s log expiry and separate10s bubbles. Both players
make an ordinary .04 heading change every30s so the unchanged120s inactivity
policy does not disconnect a deliberately silent receiver. Frame delta is
explicitly capped to .05 in this fixture; expiry checks wait real elapsed time.
The test covers zero height, menu AV/PÅ, sub-padding2px height, restored sizing,
rotation, reconnect, typing, ordinary command routing, actual12/min server refusal
and refill, a real silent minute followed by a new line, and client burst refill.
The existing DOM settings fixture additionally checks persisted menu state,
wrapped rows/safe areas and controlled expiry boundaries by advancing stored
expiry timestamps; those controlled checks are separate from real-time waits.

The unmodified db8e9ae baseline received3/3 network messages at390×300 with both
clients connected, but its46px log discarded each56.7px wrapped newest row.
An eight-message667×375 control continued normally. Both inventory commands
completed with CLI0; the former records the observed product failure, not a
passing continuity assertion. Saved before/after native PNGs show the empty
baseline log and the fixed latest row's visible beginning. At46px the rest of a
long row remains clipped; no full-text visibility is claimed where it cannot fit.
The desktop fixture's existing QR occludes some older upper rows; chronological
latest rows remain readable. The blank background is a DOM fixture, not World.

The first long acceptance attempt retained CLI1: after passing continuous traffic,
server-minute refill and real expiry, its stationary receiver exceeded the existing
120s idle-disconnect interval, so the final new-line receipt timed out. That
fixture failure did not justify a runtime connection change. The final fixture's
ordinary heading updates correct only this activity precondition; all failure
logs, original source hashes and screenshots remain under
`/tmp/lunden-priority-966/` and the orchestration ledger. `publication-freeze.json`
captures247 executable sources before a separately started owned Worker; PID,
start ticks and socket-FD/tcp+tcp6 evidence are retained separately. No backend
behavior is changed by #966.

After the final aaa2606 rebase, the corrected run completed94 checks/actualCLI0,
zero pageerrors/WebGL, including the real silent-minute empty logs and successful
new messages after both minute and burst refill. All247 frozen executable files
matched after completion. Owned Worker2205377 was born after the freeze and owned
port8883 according to saved FD/tcp6 evidence. The DOM settings test passed21 checks/
CLI0 after that rebase; relevant Worker chat/typing tests2/CLI0 and chat filter/
real-room tests3/CLI0 also passed. Full apartment `chattest.cjs` was not rerun;
its explicitly controlled expiry steps were updated to the new monotonic
expiry fields, preserving its separate World scope.

Published runtime `38abfdba3ee0a42e293f07eead64e1fdbe208b40` includes changelog764;
all247 measured executable bytes match that commit, and all762 older changelog
rows and publication timestamps are preserved. Pages run38528166742/
job115733377032 completed the actual deploy-pages step successfully. The shared
config change also triggered Worker run38528166703/job115733376973: its log
records actual `npx wrangler deploy`, Uploaded/Deployed at2026-10-14T07:25:31–32Z.
This verifies publication, not an additional live-device gameplay test.

### First ordinary-turn Rear (#962)

`tools/riflefirstturnreartest.cjs GAME WORKER OUT` exercises actual Ghosts/Combat,
original native HUD and two real local WebSockets. Start an owned Worker after
source freeze and verify PID/start ticks and tcp/tcp6 listener ownership. Ordinary
0 → .04 publishes without equip; head2, public/local HP, paused/repeated greeting,
held saber, legacy body1, lethal UUID/award/replay, state escapes/returns, wall,
miss and v1/r2/r3/256-byte bounds passed26 checks, actual CLI0 on final driver.
Inspected native head/body PNGs show readable authoritative markers and receipts;
this is no World/WebGL/phone/FPS or all-continuous-pose claim.

`--wrap-only` passed9 checks/CLI0: actual rifle-only Ghosts publications across
both rounded ±π representations and actual native body receipts9/8, including
return to the exact unwrapped endpoint. Those native contacts had no hc; separate
normalized PlayerRoom tests deny canonical head candidates for these aliases.
Exact serialized ±.04, including unwrapped3.14→3.18, is the supported contract;
3.14→−3.10 has wrapped difference≈.043185 and permanently invalidates this branch.
`--legacy-only`, on independently archived pre-962 db8e9ae Worker, passed7/CLI0:
new client gets pre-greet head2 then ordinary body1 after the new first-turn case.
The original #936 arm regression passed10/CLI0 but has invalid new history.
A separate actual arm test establishes valid0→.04 and greeting: actual paused
Ghost body0/wave2.4, elbowR at2.607692m before FIRST pureSkull at2.936429m;
unchanged region/entry guards reject that deeper claim even with the new named
permission. Real fresh Worker gives body1/HP9, ten body hits yield one death and
normal reset/replay/marker;10 checks/CLI0 and inspected native PNG. Producer and
raw result are preserved as `arm-first-turn.cjs` / `arm-new/` in the artifacts.

The corrected native geometry matrix uses all60 canonical appearances, both
signs/four anchors, actual first-endpoint late observers, frozen/interpolated/
capped/repeated wave, ordinary animation advance through avatar idle times4,
7.8,7.854,10.5,13.1,18.3,21 and naturally finished wave before actual saber swing.
It observed230400 rays,77462 nearest-Skull positives,619696 rounded-cell corners,
57600 earlier head-attached surfaces with rejected FIRST pureSkull deeper claims,
960 first-body alignments and0 errors/bad classifications/WebGL calls. Maximum
entry residual11.440mm is inside the unchanged15mm guard. The first600s process
endedCLI1/browser timeout after35 complete models; the disjoint remaining25
completedCLI0. Both frozen-source manifests match; combined coverage is complete,
not a claim that the first whole process passed. Original941 producer/results
are retained: its “late” case was opposite-anchor→endpoint (.08 visual span),
not actual late-first-endpoint, and its earlier idle sample omitted later extrema.

Full PlayerRoom/recovery46/46 actualCLI0 before rebase; after preserving incoming
Jaw/chat changes,48/48 actualCLI0. Focused951/952/950/9624/4CLI0
also checks exact signs/anchors, private/legacy authority, independent receipts,
strict option values and translated near-maximum coordinates. Node2/debugCLI1
mistakenly read a stale receipt after the real60points/min cap; independent
shooters and exact receipt/target assertions fix the test without changing caps.
Native wrap1CLI1 accessed a new Ghost before its first snapshot; wrap2CLI1 found
no hc in its bounded native grid; wrap3CLI1 waited for an exact raw shooter
position after a sub-movement-threshold delta. Final wait honors existing
Ghosts.move; wrap4CLI0 keeps genuine native body contacts without inventing hc.
All original failures, exits, source/provenance manifests, scripts and PNGs are
in `/tmp/lunden-priority-962` and the orchestrator's durable worker artifacts.
No other history, anatomy, animation, timer, tolerance or permission changes.
#941/#936 remain open for larger/repeated turns and stationary return lifecycles.

#962 runtime published as `2a0d12ea391a2197eafa9d3e977a3d288500c691` with grouped
changelog765. All eight measured tracked sources match the published commit;
all763 older changelog rows retain exact bytes and actual publication timestamps.
After the final Jaw/chat rebase, ordinary26/wrap9/valid-history-arm10 and
PlayerRoom/recovery48 checks passed actualCLI0; geometry/animation parity is
recorded separately from the incoming independent Jaw classifier. Genuine Worker
[run38528779053](https://github.com/solwation/lunden-3d-apartment/actions/runs/38528779053),
job115735348375, executed `npx wrangler deploy`, Uploaded07:31:17.414Z and
Deployed07:31:18.033Z on2026-10-14; version184ca716-6fb0-4553-a9a6-c4248769e310.
This establishes publication, not an additional live-device gameplay test.


### Continuous style0 RIGHT cell (#967)

Run `tools/riflerightcellproof.cjs GAME_BASE OUT` with the explicit installed
`PLAYWRIGHT_MODULE`/`CHROME_PATH`. It exports all30 style0 sleeve/build/height
variants from actual Three0.170 native CPU geometry, verifies exact canonical
vertex and scale parity, finds useful actual rounded native Skull wires for all30,
and invokes `tools/riflerightcellproof.py`. Source hashes bind the generator and
Avatar/Olof/Ghosts formulas. `certificate.json` composes head, both arms and remaining
body coverage; an individual exploratory head JSON is not a full certificate.

The source-derived prism is canonical x[-.8,-.087], y[1.628,1.632], z[.038,.042].
Head coverage encloses continuous yaw offset[0,.105], pitch±.03, breath±.004 and
both settled and fresh-bind anchors. Triangle filtering uses the entire inverse
transformed prism envelope, not a guessed bind box. The far section lies at least
4.174mm inside every native convex Skull halfspace; the full preceding prism is
separated from every other head triangle. Interval IK covers ordinary rest,
continuous wave and held/saber right-arm poses, both sleeve geometries, the mirrored
resting left arm, torso/hips and downward standing legs. The smallest remaining
arm separating margin is0.271mm after the0.1mm numerical envelope.

The envelope is a source-derived conservative CPU floating-point bound: native
Float32 geometry is exported verbatim and Three's CPU skinning uses Float64 matrix
operations. It is neither GPU certification nor a formal proof of every JavaScript
engine operation. Runtime does no geometry iteration. Affine inverse heading/build/
height transforms preserve convexity. On each x-section, intersections from one
origin through any point inside the rounded contact cell are positive weighted
combinations of its eight corner intersections (the common-sign denominator adjusts
the weights). Both rectangular end sections inside a convex prism therefore enclose
the whole ray family. The actual rounded r3 ray is checked separately: the existing
wire tube alone does not guarantee that ray passes through the cell.

The finite supplementary `tools/riflerightcellsafety.cjs GAME_BASE OUT MODE` runs
all60 appearance combinations. Canonical:17640 rays/587 admitted centers/4696 corners;
held:14400/160/1280; idle/post-wave:8640/117/936. All admitted corners retain actual
FIRST pure Skull, zero forged/earlier-surface admissions, CLI0. Endpoint/oblique/
near-max edge mode has8400 rays and **zero admitted positives**: negative-only
coverage, not positive range coverage. These samples supplement the continuous
source-derived certificate; they do not replace its displacement bounds.

`tools/riflerightcelltest.cjs GAME_BASE WORKER_BASE OUT` uses actual Ghosts, Combat,
Avatar CPU rays, two WS clients and original HUD DOM without World/WebGL. Native5
completed29/29, actual CLI0 on a separate fresh Worker started after the completed
47-file import-closure freeze, with PID/startTicks/tcp6-fd ownership recorded.
Pre/greeted/paused/repeated+held-saber hits gave HP8/6/4/2, legacy no-hc body1 left1,
and lethal head2 gave-1 with one UUID/reset; receipt replay stayed idempotent.
Subsequent heading-return/move/crouch gave body1 at9/8/7; wall/miss/version guards
remained closed. Fresh valid-history style1 and style0 native Skull centers passed
the old RIGHT leaf but failed the new cell guard and received body1 at9. These are
rejected/uncertified cells, not claims of an unsupported center. The independent
historical #957 style1 counterexample remains a supported center with a genuinely
unsupported rounded corner; its exact wire is a Node regression.

The new client against an independently archived db8e9ae Worker completed6/6,
actual CLI0: ordinary pre-greet head2 at8 and first-turn body1 at7. Head/body/legacy
HUD PNGs were inspected. Focused PlayerRoom suite completed41/41, CLI0, including
private hibernation, absent-vs-established-null, invalid/rate-rejected packets,
wrapped headings, permanent invalidation and both rejected cell examples.

Artifacts under `/tmp/lunden-priority-967` and the orchestration ledger preserve
all failures: initial conservative interval gate failures; native1's hypothetical
heading selection (outer shell0, inner result incomplete, no separately captured
exit); native2 CLI1 in the negative selection fixture; native3 CLI1 in camera-ray
search; native4 CLI1 waiting for state publication during a stopped update loop.
Native5 fixes only ordinary camera placement and coherent publication/pause/greeting
sequencing; it changes no runtime guards or animation. No partial run is called green.
Browser was Chromium145.0.7632.6 via Playwright1.61.1, native CPU only, no phone/GPU claim.


Final rebase onto6803188 preserved incoming959 Jaw,962 Rear and966 chat. Removing
only967 additions reproduces upstream config/players exactly. Removing only the two
959 Jaw-dispatch additions reproduces the earlier Avatar byte-for-byte; Olof/Ghosts
remain identical. A fresh native export/certificate2 passed CLI0 with identical
vertices, sleeve variants, all30 models and useful wire results. Combined Node tests
passed44/44 CLI0. A separately frozen fresh merged Worker completed native6 at29/29,
CLI0 with both new negative receipts and inspected head/body PNGs. The earlier all60
matrices remain source-bound to the unchanged geometry/pose formulas. Final aggregate:
`final-proof.json`; complete component outputs and original failures remain preserved.


#967 runtime published as `4ad007ec1872c5fad3f8be3b36d03e46a257b070`, grouped
head-hits changelog766. Every one of the47 measured runtime/driver paths matches
that commit exactly; all older changelog rows and publication times are preserved.
Worker run38530931585 / job115742387241 successfully executed the genuine
`npx wrangler deploy` on that exact SHA: Uploaded07:50:31.219Z and
Deployed07:50:31.585Z on2026-10-14, version567a65d4-fe81-4fe4-b9da-2062b39a8f3c.
This establishes publication, not a live-device gameplay test. Only967 is complete;
styles1/2 and3 remain in968/969 and their broader parents stay open.

### Immutable Nose prism (#971)

Reproduce without WebGL: serve the isolated tree using `tools/devserve.py`, run
`tools/riflenosesidetest.cjs GAME_URL WORKER_URL OUTPUT --export`, then
`python3 tools/riflenosesideproof.py OUTPUT`. The same native driver accepts
`--guards` for concrete hidden-Skull/cell/ray negatives, no flag for real two-client
Ghosts/Avatar/Combat→WS→Worker receipts, and `--legacy-only` for the exact preceding
Worker. Use the normal PLAYWRIGHT_MODULE/CHROME_PATH environment. The protocol
fixture derives from published #950 at2a0d12e; the new certificate independently
derives Nose geometry, never copies RIGHT planes or unpublished runtime.

The native export checks120 style/sleeve/build/height appearances, eight identical
base variants, actual object scales and pure-profile/native parity. The Nose is
convex. Its robust cross-section uses128 pitch intervals over±.03, independent
standing head height[1.516,1.524], plus bind1.54. The initial search box has radius
sqrt(.02²+.134²+.119²)<.2m about the pivot, so rotation derivative norm≤.2 bounds
midinterval displacement by .2×.06/256=.000046875m. Add the separate .0001m CPU
numerical enclosure: total .000146875m. The CPU allowance conservatively exceeds
2048 Float64 operations×2^-52×1e8/.93 (<49μm), with100μm reserved. This is a
source-bound engineering enclosure, not formal JS/libm or GPU certification, and
never widens the game's6mm entry tolerance. Geometry/pose source hashes are pinned.

Maximum rotated native Skull z=.118044984437 plus the CPU allowance rounds outward
to the .119 barrier. Head occluder triangle totals1058/1234/1182/1214 have
1053/1229/1177/1209 coarse continuous-box exclusions; each remaining five becomes
320 subtriangles, all excluded by the same full-pose boxes. No triangle is silently
filtered out. All24,576 source IK interval boxes pass, with minimum limb separation
.08333040017m. Full forward bounds for legs/arms/head are below1m. The generated
15-vertex runtime polygon is checked exactly against the certificate output.

The initial finite native inventory contains824 new samples over60 appearances;
re-evaluating those exact saved rays after tightening prism front.8→1.0 retains816,
with positives in all60. All824 raw rays and the eight exclusions are retained;
this finite evidence complements the continuous certificate. The observed positive
|x|≤.00752688 does not fulfill original outer|x|>.011 coverage: #971 stays open.
A concrete unsafe ray at build1/tall.975 has pure FIRST Nose3.0286210126m behind
actual FIRST Skull3.0281664857m; native guard checks reject it in all four styles,
along with outer/cross-barrier cells, origins inside the front and rounded-ray escape.

Artifacts: `/tmp/lunden-priority-971`, copied into the durable orchestration run
folder. First real protocol passed24 checks/CLI0, using a separately started
post-freeze workerd PID2237703 and verified TCP socket ownership (both tcp/tcp6
inspected). Actual DOM screenshots show head/body markers and receipt HP; no World
was constructed. Full Players suite44/45 retains the unrelated older lateral
assertion#945; exact upstream eafa226 reproduces it on a random appearance, CLI1.
No test is silently relabelled PASS. An initial certificate assertion compared
Python tuple vertices with JSON lists despite identical numbers; it was corrected.
An initial ray-escape negative used.003, which remained inside the prism; corrected
.01 leaves it. Both failures and original source/logs remain in the evidence.

The expanded protocol3 retained an actual CLI1: one fixture-selected raw contact
rounded into old Extra on serialization, so its head2 receipt was correct and the
fixture's body1/remaining-HP expectations were wrong. Selection now checks the
exact `Math.round` r3 contact sent by Ghosts and explicitly asserts every selected
new-family serialized contact is outside all four published Nose regions. No
runtime/history permission was changed to accommodate that fixture failure.

Final post-rebase protocol4:36/36 actualCLI0, including all selected serialized
contacts outside Core/Extra/Band/Depth, pre/greeted/paused/saber HP8/6/4/2,
legacy no-hc body1, one lethal HP-1/UUID/award/reset, replay idempotence and changed
heading/movement/crouch body1 HP9/8/7. A new immutable target independently rejects
the forged earlier-Skull cell for body1 HP9, then accepts the safe prism for2HP
HP7. Separate fresh workerd2244529 started after freeze4; all253 frozen-source
hashes remain identical on closure. The exact preceding eafa226 Worker, frozen251
files before separate workerd2246042, passes6/6CLI0 with the current client:
new-family serialized hc remains body1/HP9 and replay-idempotent. Legacy source
closure is also exact. Head/body/legacy DOM screenshots were opened and inspected.
Focused #971/#950/#967/#962 room tests5/5CLI0; native guard6/6CLI0; export3/3CLI0
and continuous generatorCLI0. No additional full-suite retry hides #945.

Remaining functional work in #971 is the original exposed outer Nose shoulders
|x|>.011 with useful whole-cell coverage across the required immutable poses.
This global-barrier prism reaches only |x|≤.01042073 before cell/cone margins;
it cannot establish that outer acceptance. A subsequent source-derived outer
surface certificate must address its actual local Skull/other-surface ordering,
not expand this polygon, weaken6mm, reuse finite inventory as a guarantee or close
the issue mechanically. No missing phone or user answer is asserted as its blocker.

Publication: runtime `5dc915ae5ff9e6b002334fd0e76a20cfdb97a0cc`, grouped head-hits767.
All253 frozen paths (247 code files plus six supporting files) equal the published commit; every older changelog
byte and id publication timestamp is preserved. Worker run38533094537/job115749383790
ran genuine `npx wrangler deploy` at2026-10-14T08:09:30Z, Uploaded/Deployed at08:09:33Z,
version5e1f4085-0c2b-4bf8-b8b3-955614807cc3. Pages38533094519/job115749383963 executed
actual deploy-pages and reported success08:09:44Z. This publication is a tested
partial delivery (Refs971); the original outer-shoulder acceptance remains open.




### Style2 reuse of the continuous RIGHT cell (#968, partial)

`tools/riflerightcellproof.cjs GAME OUT 2` selects style2; omitted/0 keeps the original
style0 mode. Native data cover both sleeve variants, all three builds and five
heights. The exact original #967 prism passes the composed continuous head/arm/body
certificate and actual useful rounded nearest-Skull wires for all30 style2 variants.
Both sleeve body geometries match #967 byte-for-byte. The shared hair cap, bun and
hair ring are included as actual native triangles in the head interval gate;
no style0 geometry is extrapolated onto them. Numerical CPU-envelope limitations,
whole-cone/actual-r3 argument and observer-pose coverage are exactly those of #967.

The first source-bound style1 gate exits1 at an overlapping sidolock triangle box.
A separate directed audit establishes a concrete intersection: the original #957
wire passes the entire same prism when only the style filter is removed, while its
actual unsupported corner hit on triangle5565/5566/5567 maps to canonical
[-.0964920924,1.6287807283,.0400268346], inside the prism. The center remains actual
Skull; this proves a whole-cell obstruction, not an unsupported native center bonus
or a #946 bug. Current Avatar reconstructs the original producer's exact hash after
removing only later Nose/Jaw dispatch additions; Olof/Ghosts and all geometry/look
constants match. The failed gate and old actual proof are preserved. No arbitrary
yaw/prism shrinking is substituted: functional child #973 owns long-hair support.

`tools/riflerightcelltest.cjs GAME WORKER OUT --style2` uses the existing real
Combat/Ghosts/WS protocol with explicit style2 target selection and valid-history
style1/style2 rejected-cell controls. `--legacy-only --style2` tests the new client
against an independently archived pre-968 Worker. The producer's only style change
is a parameter; original967 producer hashes and raw outputs remain intact. The
new parameterized producer matches the independent style2 feasibility export's
vertices, variants, models and useful native wires exactly. Runtime diff only
admits style2 through the unchanged prism; removing that choice reconstructs the
entire upstream config byte-for-byte, and PlayerRoom remains byte-identical.


The unchanged all60 native safety driver completed four actual CLI0 runs: canonical
17640 rays/1174 admitted centers/9392 corners; idle8640/234/1872;
held14400/320/2560. Zero wrong corners/forged admissions or timeouts. Edge8400 rays
has zero admitted positives and remains negative-only coverage. Source-bound
continuous geometry supplies the guarantee; these are finite supplementary cases.
After preserving incoming971 Nose on5dc915a, certificate/native generation remained
exactly identical (all30 models/vertices/variants/useful wires), and combined Node
tests passed46/46 CLI0. Fresh separately frozen Worker native3 completed29/29 CLI0
with actual style2 HP8/6/4/2, lethal/reset/replay, later heading/move/crouch body1,
wall/miss/invalid guards, and fresh valid-history style1/style2 rejected cells atHP9.
Both actual HUD PNGs were inspected; no World/WebGL ran.

Original native1 CLI1/incomplete18 had no valid aim in its finite camera grid just
after crouch-return. Active shots now wait at most12s for a real available candidate
while ordinary animation continues; neither pose nor guard is modified, and paused
shots keep their already published camera. This is not positive coverage of every
animation instant. Native2 CLI1/incomplete22 exhausted negative fresh-socket
selection; that selection lacked an explicit first-draw prerequisite. Final positive
and negative selections both require actual Ghost.have/visible and ordinary frame
progress, and save selection diagnostics. These original failures remain intact.


Independent exact pre-968 Worker5dc915a/new style2 client completed6/6, actualCLI0:
pre-greet head2 atHP8 and first-turn body1 atHP7; the actual legacy HUD PNG was
inspected. Final aggregate `final-proof.json` includes all composed certificate,
source-reconstruction, native/legacy, FIRST/corner and original failure evidence.
All47 frozen runtime/driver paths match the final tested tree. Artifacts are retained
in `/tmp/lunden-priority-968` and orchestration `worker-968-artifacts`.


Style2 runtime published as `01d890998bd97585297668f5ab526b4146265413` (Refs968),
head-hits changelog768, all47 measured paths exact and all older changelog rows/times
preserved. Worker run38534033808 / job115752460152 executed actual
`npx wrangler deploy` at08:17:39.651Z, Uploaded08:17:43.009Z and
Deployed08:17:43.398Z on2026-10-14; version3c1c5b3a-efc5-49f9-ab0d-671c74dc0093.
Pages also succeeded. Issue968 stays open for functional long-hair child973;
publication is not a live-device gameplay test.


### Read-only orchestration queue (#926)

`python3 tools/orkester_queue.py --issue 926 --issue 715 --out-dir /tmp/lunden-queue`
performs only authenticated `gh api --method GET` requests. Every listing explicitly
uses `per_page=100 --paginate --include`; every selected issue and #420 also gets a
current body and all comment pages. HTTP status/Link framing supplies measured page
counts, and duplicate identifiers, malformed pagination, conflicting priorities,
missing advertised comments, auth/network/JSON failures stop with CLI1. The tool
sorts high/medium/low, creation time, then issue number; missing priority is medium.
PRs, #420 and exact `orkester` are excluded; `orkester:` ownership is retained.
Parent references/child counts are display-only. No startability or reservation
is inferred. Raw issue/comment fields are data, never instructions to execute.

Each invocation writes a unique atomic complete snapshot outside any Git worktree,
with collection start/end times and every raw response field/page. Failed attempts
use a separate `.failed.json`, status failed and null completed_at; stdout contains
no successful table. Previous snapshots stay unchanged and must not substitute for
a failed fresh read. This is a collection over time, not an atomic GitHub view.
Use a new invocation for every choice and post-reservation race read. Read selected
full raw bodies/comments and #420 before acting; the compact table is not equivalent
to that evidence. No cache-input, polling or mutation mode exists.

`python3 tools/orkester_queue_test.py` tests the real CLI boundary with an independent
fake gh executable: >100 issues, 205 coordination and101 selected comments, explicit
GET/pagination/headers, ordering across pages/ties, no-priority default, exact filters,
retained owner and informational parent, duplicate/malformed/truncated page data,
auth/partial-network/invalid-JSON/non-200/unfinished-Link failure, unchanged old
snapshot after failure, linked-worktree output rejection, deduped selection and
terminal-safe titles. No browser/World test applies to this standalone read-only CLI.

Measured real collection2026-10-14T08:29:17.890–08:29:21.842Z:62 raw issue records,
61 queue issues; full comments420=177 (100+77),926=1,715=57. Seven gh invocations
made eight successful GET response pages. Printed raw HTTP/JSON output was1,090,386
UTF-8 bytes; issue-list JSON body370,861, selected bodies/comments707,740, compact
queue table6,805 bytes, collection elapsed3.9523s (before snapshot write/printing).
These sizes describe the SAME collected dataset; the table omits raw fields that
remain in the snapshot. They are not network-compressed transfer sizes or an
information-equivalent substitute, and establish no general time/API-call speedup.

Original real CLI1 attempts are retained in `/tmp/lunden-priority-926`: installed
gh2.45 lacks `--slurp`, and plain `--paginate` merges array output, so array length
cannot measure HTTP page count. Final parsing uses explicit `--include` response
frames instead. Both failures produced failed snapshots without a fresh table.
Raw live data, command outputs and test evidence are also kept in the orchestration
ledger's `worker-926-artifacts` directory; no raw snapshots are committed to the repo.


## Learner sign and modest arrival speed (#901)

`tools/carsafetytest.cjs BASE OUTPUT --before-901` serves unchanged20ae38e Car/config/Olof; without the flag it tests current code. Same dt1/60, route JSON and parked coordinates: street15.750→13.933s, garage62.133→54.183s. These are simulated travel times, not hardware/FPS measurements. Current cruise9.5/garage3.5 are gameplay guesses; brake2 and route/controller/safety code are unchanged. Actual Player route20 remains stopped safely (minimum center5.037m), holds and resumes. Closed GarageDoor, reverse cusp, exclusions, passenger/door interaction, greeting and reload are included. The sign follows actual OlofDriver show/hide for arriving/parked/leaving, empty/hidden/garage/gone and normal completed departures; default garage save is null.

`tools/carlearnerrender.cjs BASE OUTPUT` requires an exclusive renderer slot and draws only the actual Car/OlofDriver at960×680, no World. The one bounded run's inspected rear-visible/hidden PNGs show legible green ÖVNINGSKÖR, clear registration and tail lamps, and no sign after driver.hide. Native source hashes and actual CLI exits precede publication; no physical-phone/whole-app claim. The unavailable earlier Surface candidate was not restored: this implementation starts from published900/915. An added departure test initially dereferenced a null garage in its harness; that actual CLI1 is retained and the helper now supports the game's no-garage street route.

#901 final native acceptance:43 controls/CLI0 after rebase (before26/CLI0); actual complete departures into garage and off-street gone hide driver/sign. The isolated render completed in1.576s/CLI0. Incoming #974 changed unrelated config; CAR block and every other recorded visual source remained exact, and a fresh native run verified the rebased code. Reversing only the added sign reproduces original20ae38e Car byte-for-byte; reversing only learner/speed config changes reproduces original CAR, proving unchanged route/brake/915 controller.

## Courtyard bicycle acceptance (#906)

`tools/courtyardbicycletest.cjs BASE EXTERNAL_OUTPUT` checks all five real Courtyard models with actual Player support/collision and verbatim main ray-selection, input and save handlers. It exercises E and touch-action mounts, real joystick input, speed above walking, safe exit/reload, paused input, complete wheelbase wall/door/headroom rejection and exact preservation of unowned vertices/normals, all UV/colors, toys and rack/bench targets. `BICYCLE_BASELINE=/path/to/upstream/courtyard.js` additionally compares all original visible mesh attributes, indices, material batches, shadows and collision before riding. Native runs prohibit WebGL. `--render` needs the shared graphics slot and renders two bounded isolated Courtyard/Player camera views; it does not construct World or establish physical-phone performance. World collaborators, lock flags and wall visibility are controlled explicitly.

On resume, native5 remains CLI1: the mixed CDP-touch/Playwright-tap sequence did not dispatch the compatibility click for the stand button. The replacement test uses the existing stand button’s ordinary click handler, retaining actual touch-action mount and joystick pointer coverage. Native6 passed all five bikes; native7 additionally passed the independent unchanged-upstream geometry/batch comparison.

Final native8 also checks rigid rotation of selected normals and actual DetailCuller visibility with a stationary camera; all80 checks pass, actual CLI0. The updated NW-native driver retains all nine bicycle acceptance paths and passes without WebGL; only its source anchor, controlled empty Courtyard collaborator and full-World total (14) were adapted for the combined register. Its full-World branch was not rerun. The GPU-granted isolated render2 completes CLI0 in17.45s, with both parked and saddle/styret views inspected. The first external render monitor failed while parsing a whitespace-containing `/proc/stat` name; its child exit remains unknown, empty log and no image retained. Render2 uses corrected owner parsing and records one owned Chrome master that exited and229 exact frozen paths. No whole-apartment, hardware-FPS or physical-phone claim follows.

Publication: courtyard runtime `55e768041c3b8dc48f1cf82e0e744b9dc5abc609`, changelog774. Immediate follow-up `b591a3a30d0e377c12a20daf72c793cf3c5fab40` restores the original compact changelog bytes after unintended formatting; actual before/after history runs of `changelog_stamp.py` preserve all772 older publication times. All230 final source paths match the publication, including native8’s producer. Pages run38539049178/job115769342208 ran actual deploy-pages for b591a3a, created deployment09:00:35.890Z and reported success09:01:54.790Z on2026-10-14. The preceding55e7680 Pages run was cancelled by this follow-up; no success is attributed to it. No backend Worker change or deployment was required. Raw acceptance/failure/ownership/hash/log evidence remains in `/tmp/lunden-priority-906`.

## Nerf shared head boxes (#894)

`node --test cloudflare/nerfhead.test.mjs` checks actual falling rather than sight-line
contact, floor/range clips, invalid direction, cached one-heart behavior, server-owned
2/1 damage, forged head claims, recovery, moving/turned/crouched targets and lethal
receipt. `tools/nerfheadbrowsertest.cjs game worker output` uses two actual native
Ghosts/Combat peers and local Worker sockets: three box levels, body, miss, solid
wall, movement/turn/crouch, points/marker and lethal/replay controls. It creates no
WebGL or apartment; the inspected PNG is native HUD evidence, not a rendered player,
physical-phone or FPS claim. Existing deferred obstacle deadlines remain unchanged.

The #894 final native run passed 29/29 with CLI 0 and no WebGL/page errors;
nine old `nerfContact` body rays retained their entry within 1 µm, including valid
capsule rays outside the cosmetic mesh. Focused Node tests passed 52/52, and existing
head-box geometry controls 15/15. A separate rising-path regression verifies that
an earlier body contact prevents a forged claim for a later head box. The first
chosen rising-ray fixture was actually head-first and failed as expected; that raw
CLI 1 is preserved, then corrected to a genuine body-first input. Runtime commit
`ae64de9` reached actual Wrangler deploy (run 38539777610, uploaded/deployed, version
`a15cd7cd-2cd3-400a-ac85-ad0ea799ab64`) and actual Pages deployment
38539777623. Source/producer hashes, raw exits and the inspected native HUD image are
retained under `/tmp/lunden-priority-894/`; no live shot, World or phone test is claimed.


## Jetpack body obstacles (#978)

`tools/jetobstacletest.cjs game worker output` drives actual `Combat.update()` flame
attacks through two native Ghosts/PlayerRoom WebSocket clients. It checks the original
horizontal-wall bug, a thin obstacle just before body contact, diagonal side walls,
a corner, open passage, ordinary head/body damage, old side-volume reach, transparent
and moving exclusions, out-of-volume misses, natural cooldown, lethal reset and
receipt replay. The existing `straightheadtest.cjs` now expects a wall to block both
head and body damage; `--jet-wall-baseline` remains a separate archived-Combat bug
reproduction. Native meshes/DOM do not imply World, GPU, physical-phone or FPS proof.
The Worker has no world map: this fixes client flame contact selection, preserving
its authoritative existing rate/range/damage/recovery decisions.

Final #978 native controls passed 27/27 / CLI 0, adding blocked-attempt cooldown
without another per-frame world query and a third genuine local WS peer to prove
that a blocked first foe does not prevent an open second foe in the same attempt.
The two main combat peers verify head/body, obstacle, volume and lethal/replay rules.
The first 25-check run preceded this cadence safeguard. One attempted simultaneous
straight regression timed out waiting for exactly one foe in the shared local room
(CLI 1 before attacks); its raw log is preserved separately from the sequential
final regression. The inspected native result image establishes text/HP only;
straight-fixture ack-time images have explicit native marker-visibility checks.
No marker duration was reset for capture. Raw source hashes, exits and owned
process/socket records are retained under `/tmp/lunden-priority-978/`.

The sequential final straight regression passed 79/79 / CLI 0 after the cooldown
safeguard; the unchanged actual Worker Node controls passed 53/53. Pages run
38541468314 (job115776998766) actually created deployment for runtime `cc3dde0`
and reported success. The Worker remained byte-identical to the already deployed
#893 behavior; #978 changes client contact selection only. The final head-marker
PNG is byte-identical to the earlier inspected ack-time image (SHA-256 `5cd4fa67…`).

## Cross-house entrance shell (#976)

`tools/coreentrancetest.cjs BASE OUTPUT UPSTREAM_COREHOUSE` compares the actual A/B/C CoreHouse variants against an independently archived upstream module. It uses native geometry and actual culling/door updates with a controlled player, and prohibits WebGL. The29 checks preserve the complete triangle/color/material multiset, collision walls/zones/floors, entrance dimensions/animation and original glass material policy. Distant and near representative rays and19 normal portal rays over each full door+sidelight span check that original opaque backing remains when lift/stair detail is gated. These are representative layout checks, not a guarantee for every camera angle. L’s separate Core/exterior/portik code is unchanged and its deliberately open passage is checked in actual World views.

`tools/coreentrancerender.cjs BASE OUTPUT UPSTREAM_COREHOUSE` builds two ordinary Worlds serially, replacing only CoreHouse for the archived before case; `--after-only` builds the new World once. It uses no test/cheap/lazy mode. The normal automatic loop stops after actual construction/readiness, then unmodified `app.frame(0)` integrates each fixed view. A/B/C and L each have far/near views at quality0/3,900×560 DPR1, fixed noon/June/clear weather. The perfcount-style main-screen draw counter excludes shadow/offscreen passes and records them separately. Actual32/16 PNGs, raw records, source hashes and separate owner/exit evidence remain outside the repository. Quality0 is the desktop lower graphics setting, not the `lowmem` phone profile or a phone/FPS test.

The first lobby-only candidate completed World1 CLI0 and32 images but was NOT full acceptance: a small residual C door glimpse led to a native audit finding6/19 normal portal rays without original opaque backing while detail was hidden. Its images, code checkpoint and acceptance-limit record remain intact. An initial audit incorrectly included hidden interaction helpers, then was corrected to real visible materials; both records are retained. Native1’s overstrict glass depth-write expectation failed against the unchanged original entrance material and was replaced with exact before/after policy parity. Native2’s real B sidelight failure disproved the A-only single-storey selection. The final generic static shell passes native5’s29 checks, actual CLI0, including0 missing backing rays in each house.

Final after-only World2 completed all16 matched views in70.94s, actual CLI0; all16 new PNGs and their16 original before counterparts were inspected. B/C now retain original opaque backing behind their clear glass, A remains correct, and L’s portik stays intentionally open. View positions, yaw and selected quality match exactly. Every final view passes the desktop main-screen draw/triangle bounds (max463 calls/784326 triangles); no context loss or page error. One owned Chromium master exited and its temporary profile was removed;237 source paths remained exact throughout the final run. The first run’s actual CLI0/143.25s is execution evidence with explicitly incomplete C acceptance, not a retrospectively green claim.

After final rebase, all five relevant builders (`corehouse`, `core`, `exterior`, `surroundings`, `architectureedges`) match the rendered sources byte-for-byte. The config prefix through all house/Player/POWER/material/storey data is exact; only later combat policies changed. Incoming Surface885 updates fridge/furniture/woodgrain textures and incoming weapon commits update Combat/config plus changelog. Those six full frozen paths therefore differ from World2 and have not been rerendered as a whole frame; the captured scene counts/PNGs belong to the explicitly frozen earlier tree plus this shell fix. Final native acceptance is rerun on the rebased tree:29/29, actual CLI0, with preserved original source geometry and zero missing portal backing rays in each house. Both README/verification merge sides were retained.

Published runtime `a40a26c2aa763d1461e543e6cdf6c4d22b15fa78`, changelog779. All237 recorded final source paths and the final native producer match that commit. Actual before/after history runs of `tools/changelog_stamp.py` preserve every777 older entry’s publication time, and the older raw changelog rows are byte-identical. Pages run38542766085/job115781333829 executed deploy-pages for that exact build, created deployment2026-10-14T09:30:14.212Z and reported success09:30:30.156Z. No Worker code/deployment or live-device acceptance is part of this change. Earlier failed/incomplete candidates and final raw evidence remain in `/tmp/lunden-priority-976` and the orchestration ledger’s retained worker artifacts.

### Web-swing first-person hands (#911)

`node tools/webhandstest.cjs http://localhost:8870 /tmp/webhands` exercises real Player, SpiderSuit and Hand components on controlled simple wall/floor collaborators. Set `PLAYWRIGHT_MODULE` and `CHROME_PATH` to installed Playwright/Chromium paths when needed. Native mode rejects WebGL; `--render` uses one 640×420 renderer for eight representative poses. Set `WEB_HANDS_BASELINE` to an earlier run's `result.json` to compare independent gameplay and control-pose records. This is component/browser evidence, not apartment, performance or physical-phone acceptance.

The accepted baseline (`native-before3`) passed 26/26. Before images show extended sleeves and clipped hands while swinging sideways/upwards. The small `Hand.suitArms`/`HAND.suit` change uses camera-near targets and mild directional follow; all new pose values are visual guesses. Final native checks passed 46/46 without WebGL and final rendered checks passed 54/54 (CLI 0): ground/air/side/up hands fit the image, sleeves shorten, and independent palm, shot, anchor, physics, save and held-item records match the baseline exactly. Rest, shooting, climbing and held-item hand transforms/morphs are unchanged. Production hand-before-suit frame order was retained: the settled same-frame-feed probe showed no wrist difference.

Raw evidence is retained in the orchestration ledger's `worker-911-artifacts`. Preserve the original failed candidates: the first after-run's conservative union-AABB test was replaced with actual current morphed-vertex projection; the second then exposed real left-hand clipping, corrected by a small left target adjustment. Original before-render `result.json` is a 31-check checkpoint; `completion.json` records all 34 checks. The final driver writes `checkpoint.json` separately, with both final result/completion recording all 54 checks. No failed candidate is relabelled as passing.

Publication: runtime `78489519fd41f4446d42daaffcb84a81dd14f925`, changelog782. All231 rendered source paths match the publication after final rebase; native46/46 was rerun. The retained publication manifest records1395 tracked source hashes. All older780 history-derived publication times and older raw changelog rows remain unchanged. Pages run38546602657/job115794071594 executed `actions/deploy-pages@v4` for that build and reported success2026-10-14T10:02:27.902Z. Worker run38546602656/job115794071868 actually ran `npx wrangler deploy`, uploaded10:01:47.190Z and deployed10:01:47.508Z, version98154769-9e0a-41ab-93af-8aff92fa727c. Driver/Chrome processes and their temporary profiles were verified gone; this does not claim a physical-phone test.

### Real local daily tasks (#993)

`node tools/dailytaskstest.cjs http://localhost:8870 /tmp/dailytasks` uses the real TasksManager/Life/Cooking/stats modules, existing modal/hint controls and the real card canvas with a controlled cabinet collaborator. Set installed `PLAYWRIGHT_MODULE`/`CHROME_PATH` as needed. It rejects WebGL and bypasses bootstrap, so its DOM/paper screenshots are component evidence, not a rendered apartment or physical-phone test. It checks initial immediate persistence, three unique fixed ids, actual sandwich actions, partial/done state, independent receipt versus stale home, actual document reload, no duplicate payment, real local midnight/absence versus simulated-time advance, v1/v2 migration, corrupt ids and an explicit small pool. Existing compact item/task save, actual Chicken/Grill identity/state/retry/day renewal and statistics-reset browser fixtures also run. FullWorld task/hall fixtures retain their real action/touch/cabinet assertions with the new fixed-day contract; they require a separate GPU allocation and are not claimed by the zero-WebGL run.

The original native1 CLI1 and producer/raw records remain in the worker ledger: test setup expected a record from before reading had discovered the hall, compact cases inherited paid receipts, and independent fixtures shared statistics. Corrected fixture isolation and after-read expectation passed native2; its paper PNG was readable but the modal was obscured by the untouched bootstrap loading overlay. That PNG is not panel acceptance. The final component staging hides unrelated shell overlays and records readable progress/completed modal and shared paper images. No failing result is relabelled.

The added actual HallCare actions exposed an explicit-zero migration edge in native5: a hall already tidied before selection restores as done without any awarded completion, and its zero completion count must stay zero. v3 now stores that explicit zero and defaults missing v3 counts to zero. Original native5 CLI1/result/producer and native4 CLI1 (controlled fixture missing `life.storeTargets`, corrected in the driver only) are retained.

Final #993 native6 passed42/42 / CLI0 after the last rebase; nested existing compact-save39/39, real Chicken/Grill28/28 and statsreset17/17 passed. The added real HallCare jacket/shoe actions verify partial/completed goals and that a tidied hall is excluded next day without moving home items. Actual component progress/completed panel PNGs were opened and inspected; no World/WebGL renderer was started. All1399 frozen paths match the final tested source; publication changes only the new changelog784 row. The1399-path publication manifest identifies runtime `07f87faf568bd3242d45d23e9a938f74f4552b14`; all older782 history-derived changelog publication times and raw older rows are unchanged. Pages run38549228022/job115802809753 executed deploy-pages for this SHA and reported success2026-10-14T10:23:56.134Z. Worker run38549228140/job115802810117 ran Wrangler deploy10:23:52.454Z, uploaded10:23:55.760Z and deployed10:23:56.127Z, version87cef098-3d70-4fe0-b355-37380731862c. Raw successful/failed runs, producers, owners and publication evidence are retained in `worker-993-artifacts`. FullWorld task/hall fixtures were updated for the new contract but were not run in this issue; no apartment/phone or #994 bonus claim is made.

## Bicycle terrain (#983)

`PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/bicycleterraintest.cjs BASE OUT` loads actual Player, groundY, street geometry and both existing bicycle adapters in native Chromium with WebGL blocked. It checks the real east/NW/south stair height functions, upward rejection, both ramp directions/reverse, all 1,348 actual rendered granite-curb boxes by independent mesh rays, the actual 5 cm StreetLife edging, gravity/single landing callback over a real 3 m courtyard edge, controlled full-hull wall/closed-door/headroom cases, zero-dt pause and airborne dismount refusal. The terrain height data are real; the native world collision collaborators are controlled. A separate verbatim extraction of the established courtyard fixture runs actual main E/W/action/stand handlers and real CDP touch joystick on the terrain. Adapter checks retain untouched model data and validate pitch matrices, selected courtyard normals and bounds. These checks do not certify full World rendering, a phone or live FPS.

Native10 passed32/32, actual CLI0, including an actual selected-model overhang intersecting a wall beyond the old ground capsule. Existing NW regression passed116/116 and courtyard80/80, actual CLI0, with exact pre-change geometry/material/collision baselines. The NW test's former explicit flat-only rejection is replaced by an assertion of the calculated supported tilted pose; every other assertion remains intact. Its original115/116 CLI1 is retained. Native1–6 failures remain: early incorrect curb/free-drop expectations and a real wheel-point/pivot-sweep bug fixed by round contact plus frame support; native6 also timed out on a hidden stand button. The final stand check dispatches the original click handler; actual pointer touch evidence is from the joystick and action tests, not that dispatch.

Bounded source work: at most14 pitch bisection iterations, each with2×9 tyre contacts plus13 frame probes; each hull has13 probes and movement/vertical sweeps use at most5 cm spacing. A horizontal substep reuses its previous support, and idle riding reuses the same candidate support. The representative native-only timing after reuse and full-height collision coverage was477.6 ms for100 actual25 ms ramp updates,228,700 ground queries total (4.776 ms CPU/update on this VM, native9). This is not a rendering FPS or phone result; no per-frame scene traversal/raycast was introduced. Startup curb indexing is lazy/once for street boxes and replaced when StreetLife builds its existing edging.


The pitch hull checks both the old frame capsule and its full-height projected overhang; turning/swept pose subdivisions also include that height. Parked tilted bicycle footprints keep the same conservative overhang, and their vertical margins derive from existing bicycle lengths/radius. This extra coverage was found and fixed before the first World render; the never-started earlier source freeze is retained.

One ordinary bootstrap/`__app` World pass then completed with actualCLI0 in37.90s (construction17.652s), `testMode===null`,14 registered bicycles and1,234 level-0 segments. The actual first source bicycle has yawπ; it was genuinely mounted from `source-forward(yaw)*1.88`, before explicit route fixture positioning. The same real Player/World collision instances then drove east/NW/B-C-south stair descents, ramp ascent and a curb departure; all six final poses passed bikeHull, no page errors/context loss, and all242 frozen source/producer hashes remained exact. Six900×560/DPR1/quality3 images were opened: east/south stair side views and the east saddle view clearly show the usable tilted bicycle. NW and ramp views are occluded by their real railings/screen; the curb image lacks a visible model and is **not** visual acceptance. That independent finding, exact poses/camera and image hashes are in #1002; its cause remains unconfirmed. Renderer counters are the whole frame's counters, not isolated main-pass budget/FPS measurements. Geometry/batch budgets are protected by the exact original-model baseline checks; no meshes/materials were added.

The first attempted child failed before Playwright because its module environment variable was omitted (actualCLI1/0.88s; no Chromium/World/image). The first actual World loaded normally in18.079s but its fixture chose global negative-X instead of the source bicycle's true yaw: mounting correctly refused the rack-crossing approach (actualCLI1/29.33s; no route/image acceptance). A separately approved renderer-free native actual buildWorld+Garage+Core A/B/C diagnostic (actualCLI0/12.51s,7.735s scene construction, WebGL0) saved all mount/extraction failures and proved the correct yaw-derived free approach. Runtime/mount policy was unchanged. Both failures and exact original producers/freezes remain with the successful proof. Every owned browser/process/profile was closed; no additional renderer retry followed the successful pass.

Final integration rebased onto ede9470; native32/32 passed again. Player, street, StreetLife, Courtyard and both owned test-driver bytes remain identical to the measured World. All SITE/house/PLAYER configuration before HAND and the BICYCLE block are exact. Incoming changes since render affected index.html, config, closet, furniture, ghosts, hand, interior, lights, main, pineapple, stats, tasks and changelog; new incoming imports were not rendered here. Main's cycling/active/stand/button/mouse/key/save/registry/focus fragments remain exact; its unrelated mirror/avatar use branch changed and the rebased use handler was run in final native checks. This preserves measured feature-source identity, **not** whole-frame parity for the incoming application changes. Full originals/logs/JSON/PNGs/owners/producer hashes are retained in `/tmp/lunden-priority-983` and the orchestration run archive. No phone, multiplayer cycling-pose or garage-bicycle/ramp acceptance is claimed.

Runtime publication: `d54421bf250444f32871982625c83e1387389d95`, changelog785. All1,400 publication hashes exactly match that commit; all783 older raw changelog rows and their history-derived publication times remain unchanged by `changelog_stamp.py` before/after history checks. Pages run38549965981/job115805249455 executed `actions/deploy-pages@v4` for that exact SHA, created the deployment at10:30:06.912Z and reported success10:30:12.067Z on2026-10-14. The automatic unchanged-Worker run38549966101/job115805249797 executed Wrangler deploy10:30:11.075Z, uploaded10:30:22.549Z and deployed10:30:23.016Z (version2001dc28-955e-47a8-968f-4477c32fc477). This confirms deployment, not a physical-device test. Only #983 is completed; #1002 visibility and the unimplemented garage register/parent #907 remain separate.

### First-person weapon grip verification (#913)

`tools/weapongriptest.cjs GAME OUT` exercises actual Hand and four representative weapon products: AKMS (`Rifle`), three Nerf blasters (`Blaster`), magic wand (`Wand`), and lightsaber (`Saber`). It uses plain Three.js lighting and background, suppressing apartment bootstrap. Optional `--render` uses one 480×300/FOV72/DPR1 component WebGL renderer to capture rest, firing/use, and moved camera states.

Baseline audit showed:
- AKMS (`Rifle`): lacked explicit grip, fallback placed contact at `[0.04, -0.1687, -0.27]`, ~37.6 cm forward on the barrel/handguard with 0.75 curl.
- Nerf (`Blaster`): hardcoded `[0.025, -0.075, 0.07]` had a 2.5 cm lateral offset and sat forward of modeled grip panels.
- Wand (`Wand`): lacked explicit grip, fallback placed contact at `[0.0275, 0.08, 0.01]`, ~2.9 cm off the vertical shaft with 0.75 curl.
- Saber (`Saber`): lacked explicit grip, fallback placed contact at `[0.015, 0.08, 0.01]`, ~3.5 cm from the ridged hilt segment with 0.75 curl.

Candidate correction added centralized explicit grips to `src/config.js` (`RIFLE.grip`, `TOYS.nerf.grip`, `TOYS.wands.grip`, `SABER.grip`). In the candidate run, hand contact aligns with the modeled grips (`contactError < 1e-10`), and hand curl is 1.0 (closed grip). Every held item model matrix across all phases (`rest`, `use`, `moved`) matches the baseline byte-for-byte; projectile and raycast invariants (Rifle hitscan eye ray, Nerf origin `where() + dir * 0.3`, Wand star position and eye ray, Saber tip segment `localToWorld(0, hilt+blade, 0)`) and placement/restore methods are preserved exactly. Native audit passed 54/54 PASS / CLI 0. Rendered audit passed 66/66 PASS / CLI 0. Evidence retained under `/tmp/lunden-priority-913/` (`baseline-render/`, `candidate-render/`).


### #669 initially hidden heartbeat (2026-10-14)

Run `PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chrome node
tools/crashheartbeattest.cjs /tmp/crash-heartbeat` from the checkout. It owns
local-only HTTP8878 and a disposable Chromium default context/profile, starts
no renderer/apartment/WebGL, and closes both in finally. Native tab focus causes
actual `document.hidden` changes; `pagehide` cases are explicitly synthetic
PageTransitionEvents. Stale storage times are controlled (21926 seconds), not
a six-hour runtime test, actual freeze duration or phone observation. The local
POST/public endpoint executes production Worker/CrashLog with in-memory KV.
Each controlled restart uses a fresh KV binding identity so its public-view
check is independent of the five-minute cache; production caching is unchanged.

Original source with `--baseline`:17 checks/CLI0. Candidate:16 checks/CLI0
(one fewer public-post assertion because the new hidden bg beat has no report).
Native initial hidden startup changed run→bg; native resume remains run and
hiding remains bg. Legacy run/hidden1 still posts killed/background1 with the
original build and gap in seconds; stale visible run posts killed/background0.
Clean/bg/fresh foreign tab do not post. Foreign-tab mark ownership, duplicate
foreground signature rejection and the original12-report session cap survive.
Worker crash tests17/17/CLI0; the existing real-DOM snapshot regression also
passed/CLI0 with synthetic renderer counters/context events, no apartment.

Artifacts `/tmp/lunden-priority-669-heartbeat/{baseline,baseline2,candidate}/`
retain raw reports, public projections, direct-file hashes, actual node exit,
Chrome PID/start ticks/cwd/PPid/exit and profile cleanup. The first baseline
process is CLI1: its final no-server-errors assertion found fixture favicon404
requests, after the lifecycle assertions passed. Its Chrome exited0 and profile
was removed; those facts do not turn the Node result green. The favicon handler
was corrected before the separate baseline2 freeze/run and unchanged candidate
driver. Eight frozen files are direct test/runtime inputs, not a claimed full
transitive Worker dependency manifest. There is no visual, hardware-FPS, actual
iPhone/PWA, physical context-loss or all-World acceptance claim. No historical
run/hidden1 is declared a false crash; #669 stays open.
## Existing rug placement (#1008)

`PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/rugsupporttest.cjs http://localhost:8870 /tmp/rug-support`
uses real `buildFurniture`, `Rearrange`, `Life` plates and the actual
`CatSpawner.followRug` method in a controlled scene with zero WebGL. It checks
ordinary begin/update/confirm on/off rectangular and round rugs, translated and
rotated rugs, a stacked speaker, floor/table plates, rest/lamp metadata, preview
cancel, twenty polls and fresh-page support-Y restoration. The world collision
collaborators are minimal, so this does not certify full-apartment geometry,
phone performance or GPU stability. Layout writes are local only.

The original ordinary coffee-table preview reproduced root Y .001526 instead of
actual rug top .014 (4/5, CLI1). The focused native support suite passes 25/25.
The intermediate 24/25 CLI1 is retained: full-position reload failed because the
old initial apply also shifts a previously saved plate by +.26x/+.04z. The same
full delta is independently reproduced with original `36c421f` Rearrange. Final
results explicitly retain `fullReloadXZAccepted:false`, `knownIssue:1013`; changing
the support-Y assertion does not accept or hide that separate horizontal defect.

`--render` adds one 640×420 component renderer and three real furniture images:
floor after moving the rug away, actual confirmed rug return with stack, and a
low contact view. Run only with the orchestration GPU slot. Its native checkpoint
finishes before restoring the real offline `write` method for that explicit
confirm. The first render attempt's CLI1 (native write guard accidentally retained)
and first PNG remain archived; no runtime workaround was needed. Source freezes,
raw failures, owners/socket records and cleanup are under the orchestration's
`worker-1008-artifacts` archive. No World or physical phone is exercised.

#1008 runtime publication `87da7adafee05fb795c905ae1e3080eca71eeb46` (ch793):
post-final-rebase native25/25, actualCLI0; render2 actualCLI0, all three images
inspected. Renderer elapsed was not separately measured. All1408 publication
hashes are recorded; native-final differs only in the new changelog entry, and
all older changelog raw bytes remain exact. Pages38555397365/job115823150043 ran
actual actions/deploy-pages for this exact SHA and reported success at
11:17:35.9657595Z on2026-10-14. No Worker source/contract changed, so this client
change did not require a Worker deployment. Across retained native/render runs,
81 owned child records are gone and their temporary Chrome profiles removed.


### Indoor seat upholstery (#1010)

`LUNDEN_SECRET_TEST_INPUTS=/external/private/inputs.json PLAYWRIGHT_MODULE=...
CHROME_PATH=... node tools/upholsterytest.cjs http://localhost:8878
http://localhost:8879 /tmp/upholstery-native` requires own devserve8878 and
local `node cloudflare/dev.mjs 8879 TOKEN`. It
executes six actual exported factory functions, actual mergeStatic/Rearrange,
original index DOM/source-bound main material controls, both real lamp washes
and two real local Worker-HTTP visitors. World/placement collaborators are
controlled; the ordinary begin/ghost/confirm move supplies a valid fixture
position, not an apartment collision/phone certification. Baseline factory
source is read from immutable44f3be6:src/furniture.js via git; the source bytes
match the preserved pre-edit file. Additive export aliases expose these same
original functions in the fixture, without rewriting their bodies. The checkout
therefore needs that commit's Git history. No production writes.

Native31/31/CLI0: original positions/normals/UV0/index/local poses/rest/footprints/
finishes equal the six original factories, exact handle/map/roughness/UV0 restore
after every preset, noncloth/decorative materials unchanged during preview,
merged UV1 complete/map.channel1, both actual wash hooks retained,600 previews
reuse one sofa material and only two pattern maps. Mouse/key/touch original UI
checks preview0PUT/cancel0PUT/one confirmed PUT, active ordinary peer/new visit/
real same-context reload, concurrent pose/material writes,409, offline/cache
preservation, original without pose reset and ordinary controller move. Native
webglCalls0, no page errors. A first backend command had CLI1 before the suite
because the explicit external private-input environment variable was missing;
it is retained separately. Corrected schema13/13/CLI0, same authorized external
fixture, unchanged limiter/credential behavior.

One source-frozen component render passed14checks/CLI0/3.974s with six inspected
side-by-side original/pattern PNGs,18 small before/after/pair draws and linked
UV1 attribute/complete bounds. Renderer900×560/DPR1; actual screenshot viewport
was900×600, leaving40px fixture background below the canvas (not an application
edge). Before→after calls/triangles: sofa4/11256→4/11256, armchair4/6696→4/6696,
ottoman3/1480→3/1480, kidchair3/4744→3/4744, gaming3/7096→4/7096,
vanitystool3/1248→3/1248. The one extra gaming draw isolates padded seat/back
from the formerly shared plastic base; no extra triangles. These local fixture
durations/counters are not World FPS, device memory or physical-phone results.

Artifacts `/tmp/lunden-priority-1010/` include original failures, native/raw model
proofs, six render PNG/JSON,257-source freezes and content-addressed executed
source bytes, PID/PPid/startticks/cwd/ports/actual exits and cleanup. The final
driver's only baseline-path change replaces the session-specific file with the
byte-identical immutable Git source; its render function/cloth runtime remains
traceable to the executed image producer. No extra renderer retry is claimed.


Final #1010 rebase included #1008's rug-support/floorRugLift metadata and
Rearrange/rugs changes plus #1004's independent food/Combat/Ghosts/players
changes. Both appended documentation sections were retained. Final native
31/31/CLI0 (8.010s) and schema13/13/CLI0 passed on that source. Ten original
render-freeze whole paths differ (including the portable driver baseline-read
change); the full cloth helper and all six complete factory bodies plus
seatModule match the executed image source byte-for-byte. Images remain
component evidence for their earlier freeze, not new-import or whole-World
render acceptance. Raw drift and balanced-body parity are retained separately.


#1010 publication: Worker-first44f3be60a02f1bcc042e97d730b34aacd4042938
actually deployed in38554579053/job115820431880 at2026-10-14T11:10:02Z
(version8eb46048-a244-4c6b-af06-63c9645845e4). Client
1b059f240ada77503251d7466846dc986cb5938f/changelog794 published through actual
Pages38556112799/job115825545915, correct deployment SHA and Reported success
11:22:57.278Z. All1410 repository publication hashes and257 final-native inputs
match the runtime commit; all792 prior changelog row bytes and actual
changelog_stamp.py id→publication times are preserved. Final archive is
`/home/devcontainers/.local/state/lunden-orkester/20261013-priority/worker-1010-artifacts`.
#1010 completes only six indoor seats; #1011/#1012 and #998/#991 remain separate.


### IDANÄS upholstery (#1011)

With own devserve8878 and local Worker8879, run
`LUNDEN_SECRET_TEST_INPUTS=/external/private/inputs.json PLAYWRIGHT_MODULE=...
CHROME_PATH=... node tools/bedupholsterytest.cjs http://localhost:8878
http://localhost:8879 /tmp/bed-upholstery-native`. Immutable baseline furniture
source comes from Git16398b66f9de50cd8ce2f56c10b9436aa6411cb2; additive export
aliases expose the original bed/bunk/daybed functions without changing bodies.
The actual normal merge preparation supplies bedCare attributes to other
meshes and preserves the original keep-list/moving drawer groups. Original
canvas texture content, repeat and channel compare to the baseline rather
than requiring separately constructed texture UUIDs to match.

Native34/34/CLI0: actual IDANÄS positions/normals/UV/index/local poses/finishes/
rest/footprint equal before; exact original handle/map/roughness/UV restore,
complete merged UV1/channel1 and both wash hooks, two actual Openable.toggle/
update0→1→0 cycles with unchanged interiors/pyjamas and .45m drawer vector,
melange channel0/6×6/.95 restored, original bedCare/soft placement surfaces/
Pingping home retained. Actual MYDAL×2/HEMNES wood controls keep original
geometry/finishes and no frame-textile surface.600 previews keep one private
frame material, original melange and only two generic maps.

Actual source-bound main/index UI, local Worker HTTP and two ordinary browser
contexts check preview0PUT/cancel0PUT/confirm/active poll/new visit/real reload,
concurrent pose/material/409/offline-cache/original and keyboard/touch controls.
Ordinary begin/ghost/confirm movement uses a supplied valid fixture position,
not a full-apartment collision claim. No WebGL during native. Schema16/16/CLI0
checks exactly one IDANÄS ID, unrelated-family/woodbed/bedlinen rejection,
legacy move/material preservation and original/409 semantics. Runtime/helper
unchanged for other drawers; no production test writes or physical-phone/FPS
claims. Component-image evidence and final-publication parity are recorded
after their actual runs below.


One actual #1011 component renderer passed16checks/CLI0/10.428s, four inspected
900×560/DPR1 side-by-side PNGs,12 small before/after/pair passes: patterned
closed/open from one side, restored original closed/open from the opposite
side. Compiled UV1/link status and all bound corners pass; per-bed closed
before=after23calls/23648triangles, open25/27536. Raw actual drawer states
are t0/1, position[0,0,.45] when open and contents visible only while open.
Bedding/Pingping/wood legs/interiors remain visible unchanged; pictures are
components, not an apartment/physical-phone/FPS certification.

After each real initial GET, only render contexts stop their poll timer and
restore local component surfaces to original; native peer polls remain ordinary.
Actual accepted revision/choices before/after are retained in
render-initial-state.json. This prevents local known shared choices or a poll
from replacing an intentionally staged component pattern during capture,
without altering controller/server behavior. This fixture issue was corrected
before the sole render start; no failed/second GPU run is invented. Native1's
driver, the pre-render freeze revisions and executed renderer bytes are retained
separately. Artifacts `/tmp/lunden-priority-1011/` include all source freezes/
content-addressed source bytes, actual CLI/owners/startticks/PPid/cwd, raw drawer/
model proof and four PNG/JSON.


Final #1011 rebase pins9203c90 (including1014 runtime4b1b026 and its
completion, plus Surface1005 food changes). Fresh final3-native34/34/CLI0
(11.644s) and schema16/16/CLI0 passed against its actual new index/UI/
Rearrange/helper. Earlier fa67 native results preceded1014; a shared origin
reference had advanced after that rebase and was initially misattributed as
docs in an orchestration message. Explicit ancestry/pinned-target evidence
corrects this; those earlier runs are not1014 acceptance. A module-log checker
had zero coverage because devserve does not supply those GET logs; module
absence was not inferred, and the actual suite was rerun on rebased source.

All four rendered bed/idanasFrame/addDrawer/rbox bodies and helper part/
patternMap bodies match the executed image source byte-for-byte. The whole
helper differs through1014's backward-compatible options/vertex-detail support:
IDANÄS uses default textile/klädsel/replaceDetails=false, so its new replacement
branch is inactive; ordinary map/color/UV behavior is verified by the fresh
native run. The images retain their earlier component freeze, not whole-helper
byte parity, newly rendered imports or a World/phone claim. Full drift/source
bytes and corrected provenance are archived.


Published #1011 acceptance: Worker16398b6 actually deployed in run38556975745/
job115828437155 at11:30:29.4095128Z, version
ccbfba41-e6a1-4897-9da6-f0238b259f7b. Client7ade168 actually published through
Pages38559383071/job115836400795, Reported success11:50:45.6441036Z. Full
job logs and publication-manifest.json retain the exact deployed SHAs. All1412
publication file hashes and257 final3-native inputs match that client;795
older changelog row bytes and actual changelog_stamp.py publication times are
unchanged. The orchestrator independently checked those hashes, both complete
deployment logs, final3-native34/schema16 results and all four component PNGs.
No further renderer or physical-phone acceptance is inferred from deployment.


## Patio decorative textiles (#1015)

`tools/patiotextiletest.cjs GAME LOCAL_WORKER OUT` uses actual Verona/dynbox
builders, original git3ce54a6 patio source, merge/Openable/Patio/Rearrange and
source-bound main UI. It requires the existing external secret-test input file
and explicitly rejects non-local Worker endpoints. Native forbids WebGL. Its
scene/World collaborators are controlled components, not the full apartment.

First native run passed36/36 actualCLI0 in26.234s; local services were stopped
with expectedSIGTERM and no live owners remained. Three module originals match
exact positions/normals/UV0/index/poses/finishes/rest/footprints/counts. The
original one-batch box stack and new three partitions have the exact same
triangle-corner/normal/UV0/vertex-colour multiset, retaining all eight seeds and
stack transforms before partitioning. Actual summer/rain/winter masks, lid
open/close, private material original restore, 600-preview bounded allocation,
two HTTP peers, shared reload, simultaneous independent surfaces/legacy move,
409/offline cache, keyboard/touch and ordinary movement passed. Schema18/18
passed actualCLI0. Renderer and final-rebase evidence are recorded after their
actual runs; no phone/FPS/World acceptance is inferred from native.


The sole granted #1015 component run produced six inspected900×560/DPR1
PNGs with18 small before/after/pair passes, actual17/17 checks/CLI0 in54.196s.
Three module images show the4/2/2 decorative pattern changes while the steel
frame/fixed pads stay original. Before/after module calls are3/3 with23772
triangles for the sofa and6636 for each divan. The real open box costs16→18
calls with24836 triangles unchanged: the extra two stored-copy batches are
measured here, not an assumed phone cost. Box images show an altered top cushion
and restored original but lower copies/fleece are mostly occluded by the front
and upper stack. They do not visually certify all eight copies or the whole
fleece pattern. Exact native copy geometry/material checks complement this
limited representative image evidence; no further GPU run is inferred.

Render-only component initialization records the actual initial HTTP GET/accepted
choices, then stops its own polling and restores local component originals.
Normal native peer polling is unchanged. Source/driver/external supervisor
freezes, raw JSON before PNG, actual child CLI/timeout and exact owner identities
remain under `/tmp/lunden-priority-1015/`. The supervisor's own success is not
the child's exit code. No World/phone/FPS test or production writes occurred.

The first native attempt after merging1012 retained two identical import lines
from the parallel patio edits and failed at module parse (actualCLI1/1.549s).
That failed source/driver/exit remains preserved; removing the redundant import
keeps both fixed-pad and decorative implementations. Later acceptance is recorded
only after the corrected final source is tested.


Corrected post1012 native2 reached21 green checks but hit its60s supervisor
deadline while constructing an additional HTTP peer (actualCLI1/timeout,
60.631s); this is not a successful suite. The driver had repeated the complete
original-model geometry/finish comparison and all-eight triangle sorting in
every visitor. The subsequent fixture keeps those exact baseline checks in one
proof context while all other peers still instantiate the four actual builders,
copy linkage, ordinary Rearrange/main UI and real local HTTP. No runtime rule,
assertion, credential, protocol or ordinary polling is replaced. Other agents'
local browser tests are sequenced to reduce own concurrent fixture work; no
phone/FPS or causal diagnosis follows from that timing.


Final3-native passed41/41 actualCLI0 in9.739s on the pinned main including
1012's public88b7b46 fixed-pad implementation. All original checks remain, with
explicit first/default textile vs canonical cushions, real selector switching
with0PUT/unconfirmed preview rollback, cushion cancel restoring matching stored
copies, and a real peer confirming/restoring pads independently of cushions.
The final local Worker schema suite passed18/18CLI0. Source bytes are retained
in final3-native-freeze.json plus content-addressed files.

The image-to-final native whole-path differences are patio.js (incoming1012
fixed-pad builder), streetlife.js (incoming independent bicycle culling) and the
driver (final semantic/selector assertions and bounded one-context baseline).
The rendered decorative cushion/link section and complete dynbox builder remain
byte-identical to the actual image source, with config/cushions/helper/geometry
unchanged. This is component block parity, not whole-patio/world acceptance of
new imports or a rerender of1012's separate fixed-pad choices.


Actual #1015 publication: catalog Worker3ce54a6 deployed in
run38560264991/job115839309962 at11:58:03.7271897Z, version
2c02ca43-7d5c-4eb2-bf61-7d5281779b6e, before the requiring client.
Client3364240 (changelog801) published via Pages38562044696/job115845258392,
Created deployment12:12:27.4584439Z/Reported success12:12:37.9240887Z. Its
automatic Worker38562044695/job115845257585 deployed12:12:36.9377466Z,
version6271b6ee-017a-49dd-8ce8-f3521f88cbaa. Full logs contain those exact
SHAs; publication-manifest.json records1415 published file hashes and239
byte-exact final3-native inputs. All799 old changelog row bytes and actual
changelog_stamp.py publication times remain unchanged. Last rebase added1012
completion documentation only; every frozen final3 input remained exact.
Own processes/profiles and TCP/TCP6 listeners8878/8879 are clear.


## IDANÄS linen (#1019)

`tools/bedlinentest.cjs GAME LOCAL_WORKER OUT` exercises the actual double-bed
builder/merge, source-bound main selector/controls, ordinary Rearrange and two
real local HTTP visitors. It requires the existing external secret-test inputs
and rejects non-local write endpoints. Native forbids WebGL. One proof context
compares the actual original1ff0c4a per-part positions/normals/UV0/index/care
attributes/poses/finishes/rest/footprints; peers still build actual models and
controllers without repeating that baseline comparison. MYDAL×2 and HEMNES are
unchanged helper-default controls. No whole-World/phone/FPS test is implied.

Native2 passed52/52 actualCLI0 in30.503s. All five surfaces preserve exact
distinct Original handles/maps/flags/UV0 and non-target neighbors. Actual
Openables and Pingping/soft surfaces remain original; per-bed ordinary mesh count
is25→26 through explicit material isolation. HTTP tests cover preview0PUT/
cancel, ordinary/new/reloaded visitors, independent sheet/duvet/pillowcase/
footthrow/frame selection, simultaneous pose/material, stale409/offline/old
capability, keyboard/touch and ordinary move. The first native run reached20
green checks but timed out at60.675s during a peer wait; it remainsCLI1, with
its source/producer/owner record retained, never counted as successful.

Actual Life/Rest/BedCare/Runner and a held watering-can LifeItem test lie→rumple,
blocking while resting/holding, timed half-make/interruption, double press, exact
make restore, sitting, three repeated cycles and Life.serialize/flush followed
by genuine same-context reload/restore. Both marked merged sections (530+9216
vertices: foot throw and duvet/fold) deform under their original care-index0;
every unmarked vertex remains exact. Every original position and smooth normal
restores after making. Per-part care/index parity is measured before merge;
material splitting may reorder merged indices, so no byte-identical merged-index
order is claimed. Schema19/19 passed actualCLI0. Render/final integration evidence
is appended only after those actual runs.


The sole #1019 component renderer passed17/17 actualCLI0 in34.639s with
no timeout/live owners. Six inspected900×560/DPR1 side-by-side PNGs show
individual sheet, pillowcase, duvet/fold, footthrow and accent choices, then all
Original from the other side. The visible sheet rim changes, both pillow types
follow the shared case choice, duvet/fold and footthrow remain distinct, and
frame/Pingping stay original. Each actual component before/after screen pass
costs23→24 calls with23648 triangles unchanged; ordinary mesh25→26 is a
different model counter. ShaderUV1/link and clip corners pass. These are
components, not an apartment, phone or hardwareFPS test.

Render-only setup saves the legitimate initial HTTP GET/accepted state, then
stops component polling and restores local originals; native visitor polling
is unchanged. Runtime/source/driver/external-supervisor freezes, raw per-view
JSON before PNG and exact PID/PPid/startticks/cwd/socketFD/tcp/tcp6 evidence
are retained under `/tmp/lunden-priority-1019/`. The actual child-exit record
controls success rather than the supervisor's ownCLI0. The exact temporary
render browser profile is absent after cleanup.


Final integration pins f116267c05905f6a59e3d6491337ec784d54d2ce, including
both other bed families' backward-compatible catalogue entries. Actual final
native52/52CLI0 passed in14.456s; final Worker schema21/21CLI0 passed. All
239 final-native inputs are frozen with source bytes/producer/runner manifest.
Only config.js/materialcatalog.js differ from the executed renderer through
those additive family definitions/whitelists; full addMattress/addDuvet and
double-bed bodies, helper, shapes, rest/care/life and UI remain byte-exact.
Images retain their executed component source rather than a rerender or a
whole-World certification of the other new families. The final native DOM
library image was also opened and inspected.


Published #1019: Worker1ff0c4a actually deployed in run38562745050/
job115847642300 at12:18:27.3496463Z, version
230e752c-12a0-4700-8fc5-57951fc2c2ae, before the requiring client. Client
88def956 (changelog803) actually published via Pages38564859418/
job115854834485, Created deployment12:35:12.8669029Z/Reported success
12:35:23.3982509Z. Full logs retain those exact SHAs. Publication manifest
records1417 published file hashes and239 byte-exact final-native inputs;
all801 older changelog row bytes and actual changelog_stamp.py times remain
unchanged. This client's furniture-only runtime does not trigger another Worker
payload deployment; no automatic client-Worker run is invented. Exact owned
processes/four browser profiles and TCP/TCP6 ports8878/8879 are clear.

The preserved first native failure.json contains20 partial PASS checks (an
initial orchestration/comment count said21 and is corrected here); actualCLI1/
timeout is unchanged. Final52/schema21/render17 counts are from their raw
results.
### MYDAL linen verification (#1020)

With own devserve8870 and local Worker8871, run `LUNDEN_SECRET_TEST_INPUTS=/external/private/inputs.json PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/bunklinentest.cjs http://localhost:8870 http://localhost:8871 /tmp/bunk-linen`. Immutable Git1ff0c4a supplies the original actual bunk builder; additive fixture exports expose the same function bodies. Premerge positions/normals/index/UV0/bedCare markers/finishes/rest/footprints compare exactly. Actual merge prepares zero bedCare attributes exactly as buildFurniture does.

Native2 passed35/35, actualCLI0/21.897608s, zeroWebGL. All twelve surfaces isolate one material and restore originals; actual Rest/BedCare/Life exercises four slafs independently with8640marked vertices each. Every other vertex in both beds stays exact during rumpling; make restores originals, timed interruption restores rumpled state, held-hand guard blocks making, fullLife.serialize/load restores saved units, lower watch sitting never rumples. Source-bound real main/index UI and two local HTTP visitors cover preview/cancel0PUT, confirm, active ordinary peer/new visit/real reload, all twelve saved surfaces, concurrent berth/material/pose,409/offline/cache/legacy capability, keyboard/touch and ordinary move. Placement collaborators are controlled; unchanged fullWorld hold/bedcare fixtures were not rerun.

One separately granted component renderer passed9/9, actualCLI0/13.802250s, two inspected original/pattern pairs covering unicorn/vader. Renderer900×560/DPR1; fullPNG900×600 includes40px fixture background below the canvas. Both beds before→after5→9draws and25,556→25,556triangles, actual compiled UV1,0PUT/errors. Actual GET state is retained; render-only local components stop polling/resetOriginal after GET, native polls remain ordinary. Artifacts `/tmp/lunden-priority-1020` retain producer/runtime freezes, raw model/surface/care/HTTP results, images, actual process exits/startTicks/owners/socket tcp+tcp6 and profile cleanup. All11render owners gone/profile absent. These are component/native results, not World/physical-phone/FPS claims.

Final #1020 integration pins actual1019client88def956. Both optional helper bodies, the complete bunk builder and whole upholstery helper/driver exactly match the rendered source; incoming1019 IDANÄS bed/import and all documentation append blocks are retained. Final fresh-Worker native35/35/CLI0/38.537888s and schema21/21/CLI0 passed on this tree. Earlier final35/CLI0/13.711519s onf116 is separately retained and does not claim1019 runtime coverage. The whole furniture path differs through the incoming IDANÄS body/import; config/catalog differ through already-deployed unrelated-family additions. No new renderer/World/physical-phone acceptance is inferred.
### HEMNES material family (#1021)

`tools/daybedlinentest.cjs GAME LOCAL_WORKER OUTPUT` uses the actual custom daybed, private textile bindings, normal merge/zero-care preparation, source-bound main library/selector and actual Rearrange controllers over local HTTP. It compares pre-change geometry/UV0/care/finishes once, checks all eight independent Original restorations, normal three Openable drawers, and exercises actual Life/Rest/BedCare lie/make/interrupt/hold/save/reload rather than substituting a made flag. Native mode prohibits WebGL, requires an actual empty local Worker GET, preserves polling and reuses two live browser contexts for independent/stale writes. Component `--render` is a separate explicit-grant path, not World/phone/FPS evidence.

Original failures remain retained: schema1 had a wrong expected literal ID (the catalogue's existing serial calculation was correct); native1 stopped before checks because of a copied fixture.Object.keys typo. Native2 passed28 checks before the fixed60s deadline (60.517752s), then stopped in an unnecessary extra peer setup before care/save acceptance. Its28 checks and model baseline are partial evidence, not a green full run. Native3 replaces those repeated transient contexts with the existing real peer, preserves separate ordinary/new/reload checks, and adds per-setup/lifecycle timings; no product acceptance is relaxed.

Native3 completed51/51 checks, actualCLI0 in26.626596643s with no live owned descendants and no remaining temporary browser profile. Actual BedCare has one marked spread section with1,428 vertices/index0; all unmarked mattresses/five cushions/frame/drawers remain exact during rumpling. Real Rest/Runner interruption, held Life watering can, repeated make, exact normal/position restoration and Life.serialize/flush/genuine reload passed. The ordinary/new/reload HTTP peers, independent surface/pose, stale409, offline cache, Original and keyboard/touch source-bound UI checks passed. Native mode made zero WebGL calls; images/render budget are separate evidence.

Final post-#1019 native completed51/51, actualCLI0 in12.135349s, on explicit published base88def956e199c5ff17f4b9da88046cb9dc6c0b43. Actual fresh local Worker GET and all original UI/HTTP/lifecycle/care assertions passed again; schema21/21CLI0. Daybed body and entire upholstery/BedCare/bedding/Rest modules remain byte-identical to the inspected render. Only unrelated double-bed helper branches and import changed; the final native exercised the combined module. No further GL was run.

The last code rebase pins both published families at94df2773a22d26f4cc57d3896c5f6461916196a5. Fresh-Worker final2-native passed51/51, actualCLI0 in14.948684s with no live owners; final2-schema passed21/21CLI0. BED/BUNK/DAYBED imports and all families remain intact. Daybed and four whole helper/lifecycle modules still match rendered bytes; unrelated bunk body/import is the only further whole-furniture drift. No additional visual acceptance is inferred for those incoming families and no further GL is needed.

#1020 published client94df2773a22d26f4cc57d3896c5f6461916196a5/ch804 after a separate successful push and exact remote-main check. All1418 publication file hashes are recorded; all14 final-native input paths remain exact through the final docs-only1019 rebase/changelog addition. All802 older raw changelog rows and their history-derived publication times are preserved. Actual Pages38565345849/job115856485037 ran actions/deploy-pages@v4 for this exact build, created its deployment12:38:42.6455701Z and reported success12:38:47.8907799Z on2026-10-14. Worker-first895086e/job115848446815 had already actually deployed12:20:25.8047925Z/versionbb54004c-3db7-40ca-ac86-1bd9ccd73a47. All96 recorded own process/startTick owners are gone, all five temporary profiles absent, and own8870/8871 services stopped explicitly. No further GPU/World/physical-phone verification was run or implied; only #1020 is completed, parent#1000/#991 remain separate.
Published client8541533116be0e9d79aeaa62522f4e4526d9068a (ch805) matches all241 src/data/index hashes and all13 final-native producer paths. Actual Pages38565553633/job115857194420 created this exact SHA at2026-10-14T12:40:21.3983611Z and reported success12:40:26.5388062Z. The client-only commit does not trigger the Worker workflow; compatible Worker-first f116267 actually ran wrangler deploy12:23:45.6032650Z and Deployed12:23:49.1410089Z, versionf3a39e4b-3f43-49fc-b4bb-52d7d1455c55 (run38563417647/job115849954165). All original failures,605-path final producer and earlier sources, raw receipts/PNG/owner sockets, exact profile absence and owned local service cleanup are archived. No production verification write, full World, phone or FPS claim is made.
