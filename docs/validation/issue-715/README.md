# #715: bounded combat collision work

The confirmed desktop CPU hotspot was remote dart collision: the old Combat query asked the whole apartment/urban scene to raycast before discarding ghosts, moving and transparent objects. A diagnostic query visited about 5,970 mesh raycasts, including internal instanced-mesh work. Large merged backdrop geometry dominated triangle work. A bounding-box-only experiment did not improve the workload and was replaced.

`combatworld.js` now applies existing exclusions before raycasting and can reject a finite segment in empty cells of a conservative, geometry-local occupancy grid. Native Three raycasting still determines every possible solid hit. Private bounds never alter authored `geometry.boundingBox`. Visibility, membership and transforms remain fresh; buffer/index version changes use native fallback while rebuilding. Custom, instanced, skinned and morphing meshes bypass acceleration.

## Desktop evidence

One retained actual apartment runtime (base `580ecf7` plus the narrowly scoped #717 grill helper) was used throughout. Its Combat collision methods matched the pre-change production implementation. The final production Combat/helper/config source was imported with cache-busted URLs into the existing Combat instance; the production constructor preparation function was called explicitly on that same scene. No cold scene reload or synthetic replacement collision algorithm was used. Headless Chrome/SwiftShader on Linux is not a physical phone.

| Uninstrumented CPU sample | Before | Ready cache |
| --- | ---: | ---: |
| Same 30 short scene queries, median / p95 | 31.9 / 42.3 ms | 6.0 / 8.7 ms |
| Two shooters, 120 effect-update steps, median / p95 | 63.8 / 106.3 ms | 7.1 / 15.0 ms |
| Two shooters, steps over 16.7 / 50 ms | 120 / 112 | 2 / 0 |

The shooter workload used actual local Darts and remote Combat/Darts, five shots per shooter over two simulated seconds. The warm baseline avoids an unrelated first local Marks/TriGrid build (2.7 seconds in an earlier sample). CPU measurements exclude rendering and the rest of the main frame. Remote expiry also reads performance.now(), so the slower baseline can expire effects earlier: the inputs and simulated steps match, not necessarily the active-effect count at each step. A real draw in each case stayed at 173 calls / 635,111 triangles, but darts were outside the fixed grill-focused view; this does not measure visible two-player render cost or FPS.

All 120 prerecorded courtyard/apartment queries and 16 actual door-transform states matched the original solid-hit results. `tools/combatworldtest.html`: **96 checks ALL PASS**, actual Three without WebGL, including ready-grid rejection, edge/corner/finite-segment cases, pending fallback, mutation, authored bounds, disposal and custom/layer semantics.

## Cold cost and remaining verification

The final retained-scene cache admitted 128 geometries: **524,288 bytes of bitset storage**, **1,048,576 accounted bytes including reserved bookkeeping**. These are not measured JavaScript heap figures. Idle construction accumulated **3,420 ms CPU**, reached readiness after **181.926 seconds**, and the largest observed slice was **4.9 ms**. The configured 2 ms work budget is not a hard wall-time bound; scheduler/GC can overrun it. Earlier experiment jobs overlapped early scheduling, so elapsed readiness is contextual rather than a clean standalone startup benchmark. Native queries remain available until each grid is ready. Removal without geometry disposal can consume the lifetime admission quota and safely leave later objects unaccelerated.

An actual local PlayerRoom and production Ghosts sample measured two shooters at about 4.30 outbound messages/s and 296.7 UTF-8 JSON payload bytes/s each; each received about 8.60 messages/s and 569.4 payload bytes/s. This excludes WebSocket/network overhead and does not establish phone bandwidth as the cause.

**#715 remains open.** Physical-phone idle/one-shooter/two-shooter frame timing, visible effect cost and user experience still need verification; this change only demonstrates and reduces one reproducible desktop CPU bottleneck.

Detailed local artifacts: `/tmp/lunden-715-shots` (JSON samples/source harnesses); fixture output `/tmp/lunden-715-fixture-result.txt`.

## Spatial-ready remote-dart integration follow-up

After #714, remote darts' `Combat.reach` queries also route overlapping segments through the guarded private spatial triangle views. This avoids waiting for the later bitmap-fill phase; unsafe/instanced/custom cases keep their native fallback.

The Three/no-WebGL fixture passes **462 checks**: previous 459 plus 3 forced-bitmap-zero integration checks proving independent native object/face/UV/normal/distance equality and fewer actual vertex reads on an overlapping spatial-ready hit. Vertex-counter evidence is separate from the uninstrumented CPU run.

`tools/combatremotetest.cjs` supplies the actual historical 633c18c helper source from `git show` to the companion HTML fixture; only an export identifying the baseline is appended. Both historical and fixed helpers have spatial-ready caches with bitmap admission zero, so the historical reference retains its actual semantic filtering and private-bounds/spatial pruning. The controlled small 32,000-triangle sparse mesh includes off-path z-extents; it is not apartment geometry. Actual `Combat.remote/reach` and `Darts.update` run five repetitions of the same two shots and 60 steps. Remote TTL is temporarily 600 s, restored in `finally`; active counts per step and final positions/flight/visibility agree. All 3 checks pass. Historical update CPU totals 2285.2 ms versus 126.3 ms; median 7.7 ms versus 0.3 ms and p95 15.5 ms versus 0.9 ms. No renderer/Worker/FPS/physical-phone claim; #715 stays open.

Logs: `/tmp/lunden-715-integration-result.txt`, `/tmp/lunden-715-remote-exact-result.txt`.


## Cold-path diagnosis 2026-10-13

The new public reports (54 records fetched on 2026-10-13) contain two actual iPhone loss/restore pairs: hour buckets 04:00Z, build `ebb77a7`, kitchen, uptime 53.6 s, restore 23 ms; and 08:00Z, build `a9ec5d0`, hall, uptime 76.3 s, restore 15 ms. Both reached `phase: done`. Neither report establishes shooting or PvP; exact time/activity still awaits the user's confirmation. These are crash evidence, not physical validation of remote-shot performance. See [the original evidence](https://github.com/solwation/lunden-3d-apartment/issues/669#issuecomment-6142214946).

The existing [#769 cold-path record](../issue-769/cold-path.json) returned `null` after 4214.9 ms against an unchanged 2 s deadline, with 804 pending / 4 spatial-ready caches and a reported maximum asynchronous slice of 5.1 ms. It does not isolate whether elapsed time was spent in cache waiting, scheduling delays or traversal. It does not justify calling all 4.2 s one synchronous native raycast. No new apartment benchmark is claimed here.

The production helper now retains one non-identifying, copied `combatWorldMetrics().lastPath` record per completed asynchronous query. Outcome/reason and final stage distinguish a cache-wait deadline from traversal, cancellation and cache invalidation. `elapsedMs` partitions into `activeMs` (wall-clock intervals between yields) and `yieldMs`; `cacheWaitMs` is the subset of yielded time spent waiting for promoted cache entries. `maxSliceMs`, `promotedCaches` and `deadlineOverrunMs` give context for that query. These are wall-clock measurements, not measured thread CPU/GPU time. Cache-builder work, render work and scheduler delay occurring while yielded all belong to yielded time and are not distinguished from each other. For concurrent queries the retained record is the last completion, not necessarily the last shot started. There is no event history, scene reference, player identity or automatic upload. The native 2 s budget, scheduling, hit results and gameplay are unchanged.

The remaining acceptance requires the same idle / one shooter / two simultaneous shooters scenario on a physical phone, with frame/long-frame, transport and effect/render measurements before/after. Today's loss/restore pairs provide none of those PvP comparisons. The added diagnosis supports a next cold-query measurement; it is not a phone fix or evidence of improved phone FPS.

Standalone actual-Three/no-WebGL regression: **ALL PASS, 485 checks**, including 23 new diagnosis checks for successful results, cold cache promotion/wait, active/yield partition, initial cancellation, deadline overrun in a synchronous custom raycast, copied snapshots, pending-wait cancellation and cache invalidation. A separate bounded Playwright driver waited on the fixture's authored `window.result`, exited 0 and recorded no page errors; `/tmp/lunden-priority-715/result.json` and the reviewed full-page text-fixture screenshot `/tmp/lunden-priority-715/fixture.png` are local artifacts. This is a module regression, not a rendered apartment or phone benchmark. The generic runner separately timed out despite the authored ALL PASS terminal because its exact-line detector rejects the existing suffixed summary; that independent runner bug is tracked in [#861](https://github.com/solwation/lunden-3d-apartment/issues/861) and was not changed here.

## Local cold-shot mitigation, 2026-10-13

The user reported recurring phone PvP lag yesterday evening and requested a concrete attempted fix. Inspection found
that the earlier remote-shot indexes leave local Darts → Marks.hit → Marks.segment unaffected: the first local shot
synchronously constructed a full TriGrid for every large static surface, including distant scenery, before any box rejection.

The candidate performs a private conservative position-bound rejection before constructing a grid. Authored boxes
remain intact; float32 world-coordinate rounding is included; existing furniture invalidation clears both caches.
Moving/native paths, physical-render-layer independence, hit sorting and hit point/normal/object/material metadata remain.

Verification: real Chromium, actual Three, Marks and Darts, no apartment bootstrap or WebGL renderer. Baseline source
is exactly `524ebc9:src/marks.js`, supplied by `tools/marksbroadphasetest.cjs`. The ten-check fixture covers transformed
static contact, miss, endpoint, deliberately wrong authored bounds, render-culled surfaces, furniture invalidation,
moving door contact, separate vertex-read proof and two identical local shots through distant scenery. Eight separate
16,128-triangle spheres per cold run; 60 Darts.update steps; no vertex counters during timing.

| Measured update work | Previous | Candidate |
|---|---:|---:|
| Cold first two-local-dart update | 47.3 ms | 1.7 ms |
| Sum of 60 updates | 48.6 ms | 2.9 ms |

All active counts and final dart positions/velocities/range/visibility/flight/spent flags and splash count match.
The separate distant indexed-sphere probe counts 11,904 versus 2,145 position reads: the candidate scans positions
once for conservative bounds and avoids triangle/cell allocation. All ten checks passed without page errors;
`marksphysicstest.html` also passed through the public runner, exit 0, no game document.
Local evidence: `/tmp/lunden-715-candidate-final/result.json`, inspected `marks-broad-phase.png`, and
`/tmp/runtests-1549801/marksphysicstest.log`/`summary.json`.

This establishes a real reduction in unnecessary cold local-shot CPU work in a controlled scene. It does not establish
phone FPS or prove the user's sole lag cause. Overlapping cold grids can still build synchronously. The candidate is
published for normal gameplay feedback; physical-phone acceptance is not used to block shipping the improvement.

The broader rendered-apartment `nerftest.html` was deferred to keep one exclusive app/browser workload on the shared VM.
The native actual Marks/Darts and physical Glass checks above are the performed acceptance for this narrow change; no
rendered apartment Nerf result is claimed. #715 stays open to monitor the candidate during normal play.

## Actual apartment Nerf integration, 2026-10-13

`tools/nerftest.html` was run against the actual apartment at source `4259bb7`:
**ALL PASS, seven checks** (held blaster, visible in-flight meshes, wall paint,
colour, floor landing and fade). The embedded rendered view and terminal text
were inspected. This fills the explicitly deferred apartment Nerf regression for
`8d0da26`; it does not establish phone PvP acceptance.

`tools/nerfapartmentprobe.cjs` runs a separate bounded normal-production scene,
without `&test`, at quality 0 and 480×300. Only the automatic animation-loop
registration is paused through a served-source hook; it drives actual local
Blaster → Darts → Marks and incoming Combat.remote → Darts → Combat.reach.
The incoming launch height is derived from the actual held blaster. Each phase
uses five shots per shooter, 60 fixed 1/60-second effect steps and two explicit
renderer calls. A remote effect's visual TTL is extended to 600 seconds to keep
host rendering delays from expiring it. This is one actual apartment with an
injected incoming peer record: no second browser, network transport, avatar,
server hit approval or physical phone is represented.

Cold phases invalidate the actual scene's Marks caches. "Local warm" means those
local caches are retained; remote cache readiness is reported independently.
The probe permits a 1.5-second scheduler gap before the local-warm phases and
separately performs a same-room finite-segment obstacle query with the production
2-second deadline. This query is diagnostic, not a server-confirmed PvP hit.

The captured update intervals include Darts and Marks only. Renderer-call wall
intervals are CPU submission/possible driver waiting, including first-use shader
work; they are neither measured GPU duration nor rendered frame/FPS. Raw
`renderer.info` counts are retained for diagnosis and are not a total-pass budget
measurement (nested passes can reset that counter). Simulation, lighting,
shadows, network and all the other normal frame work are outside the effect
intervals. No historical native parity or before/after phone gain is claimed.

Reproduce using `python3 tools/devserve.py 8873 <checkout>` followed by
`PLAYWRIGHT_MODULE=… CHROME_PATH=… SHOTS=/tmp/nerf-apartment node tools/nerfapartmentprobe.cjs http://localhost:8873`.
The driver has a 240-second wall limit and writes JSON before taking the picture,
so a screenshot failure cannot discard completed measurement records.

Two exploratory runs are excluded: a lazy-test cost attempt was stopped, and a
normal-render attempt placed the incoming dart on another floor (outside the
camera). Its corrected driver completed but that scenario cannot establish a
same-room two-shooter view. An earlier final quality-3 screenshot also timed out;
its unsaved timing values are not used. Local excluded artifacts remain in
`/tmp/lunden-nerf715-surface/` for the audit trail.

The retained effect-interval run used source `33e7dfd`; diagnostic driver exit 0,
no page errors. The [raw samples](apartment-effect-intervals.json) retain every
step, active-effect count and cache snapshot:

| Actual apartment effect steps | First / median / p95 | Maximum | Sum of 60 |
|---|---:|---:|---:|
| One local shooter, cold Marks | 625.1 / 4.6 / 13.2 ms | 625.1 ms | 936.7 ms |
| Local + incoming, cold Marks | 346.1 / 24.5 / 82.8 ms | 346.1 ms | 2079.7 ms |
| One local shooter, retained Marks | 5.9 / 4.3 / 14.1 ms | 20.3 ms | 344.5 ms |
| Local + incoming, retained Marks | 77.7 / 25.2 / 75.6 ms | 91.8 ms | 1798.7 ms |

These are contextual single-run samples, not a native before/after benchmark.
There were 804 pending remote cache entries and zero spatial-ready/ready entries
in every phase. The scheduler gap did not establish a warm remote workload.
Pending Nerf approval effects were zero throughout: the injected incoming record
exercises remote visual collision, not reciprocal multiplayer approval.

The separate 2-second finite-segment obstacle query returned `null` after
2003.7 ms. Its lastPath result was deadline/cache: active intervals 11.4 ms,
yielded 1991.2 ms, cache-wait subset 1988.2 ms, maximum active slice 2.2 ms,
56 promoted entries and deadline overrun 3.5 ms. This establishes cache waiting
in that cold diagnostic, not a single synchronous 2-second raycast. Cache-builder
active wall intervals are not thread-CPU measurements.

Inspection caught another rendering limitation after recording those effect
intervals: manual Darts updates had not run the actual DetailCuller, so spawned
children retained their old hidden render layer. Both dart origins projected
inside the viewport, but projection/group visibility alone did not prove actual
rendering. The render timings/counts and screenshot of that run are therefore
**excluded from visible two-shooter render-cost evidence**. The reusable probe
now calls the native culler before draws; a separate `--picture-only` capture
checks actual child render layers and finishes the native GPU commands before
its screenshot. The effect-timing suite was not repeated to invent new render
figures.

This verifies the published mitigation's apartment Nerf regression and supplies
concrete remaining work: cold local collision work still makes a large spike,
and unready remote caches still matter. No additional collision algorithm was
changed on the strength of these samples alone. #715 remains open; the physical
phone's reported lag and a full rendered reciprocal-PvP before/after comparison
remain unverified.

The separate final picture-only capture completed with driver exit 0 and no page
errors at source `33e7dfd`, 960×600, production quality 0. The
[reviewed apartment image](apartment-two-darts.png) shows the actual held Nerf,
local dart and incoming dart in the dining/living view. The
[capture metadata](apartment-picture.json) records all four child render-layer
checks as true, local NDC `(0.124, -0.149, 0.920)` and incoming NDC
`(-0.105, -0.193, 0.898)`. Both tiny blue/orange darts can be seen ahead of the
blaster. The native culler was updated before drawing, and `gl.finish()` was used
only for this final capture. This provides rendered integration evidence,
without turning the excluded earlier renderer intervals into a visible-effects
benchmark. Reproduce only the picture with `--picture-only`; it skips the timing
phases and obstacle query.

## Cold triangle-copy follow-up, 2026-10-13

The preceding apartment's 625.1 ms effect spike justified investigating local cold work. The subsequent
**native, no-WebGL component profile does not attribute that 625.1 ms**: it calls the unchanged production
`buildFurniture()` without world/app bootstrap and profiles its six largest meshes plus one controlled
sphere. The historical `a336e30` TriGrid constructor is served with three timing boundaries only. Its copying
phase includes array/group allocation, world transforms, Float32 copies and private-box expansion; its
binning phase includes cells, big-triangle lists and the stamp array. These are wall intervals with JIT/GC
context, not isolated thread-CPU or measured heap/GC pauses.

Five phase repetitions per case gave the following median intervals:

| Profile case | Triangles | Transform/copy | Cell/bin phase |
|---|---:|---:|---:|
| Production furniture largest 1 | 57,120 | 20.5 ms | 4.5 ms |
| Production furniture largest 2 | 18,900 | 6.7 ms | 1.9 ms |
| Production furniture largest 3 | 15,288 | 5.2 ms | 1.6 ms |
| Production furniture largest 4 | 15,288 | 5.0 ms | 1.6 ms |
| Production furniture largest 5 | 11,832 | 4.2 ms | 1.3 ms |
| Production furniture largest 6 | 11,400 | 4.0 ms | 1.1 ms |
| Controlled sphere, not apartment | 16,128 | 9.2 ms | 2.1 ms |

The results support a smaller intervention than changing collision scheduling. Each vertex previously
allocated `[p.x, p.y, p.z]` and called `tri.set` into its world-triangle buffer. Three direct assignments now
produce the identical Float32 values without that temporary array. The same transform operations, group
bytes, private box, cell map, big list and native historical TriGrid hit routine remain. There is no async
cache lifetime, fallback raycast, admission quota or gameplay deadline change.

`trigridcopytest` supplies the **unchanged historical TriGrid source** via `git show a336e30:src/trigrid.js`.
The historical Marks source has only its import pointed to that reference. Eight mesh cases cover the
six real furniture meshes, a transformed indexed multi-material box with BackSide materials, a restricted
drawRange and deliberately incorrect authored boundingBox, and an indexed sphere. **93 checks ALL PASS**:
exact Float32 triangle/material/private-box/cell membership and order/big-list identity; exact object,
material, point, normal and distance for six axes/sign rays per case; and twelve actual local Darts/Marks
cold/warm active-count/end-state/splash-count comparisons. Historical drawRange/BackSide behaviour is
preserved, not corrected or substituted with Three's native raycaster.

Construction timings use neither injected phase timestamps nor vertex counters. Twelve repetitions per
case alternate reference-first and candidate-first equally. Cold effect timings likewise alternate order
across six repetitions of two actual local darts and 60 effect steps, against the production furniture
component. Geometry construction and toy/mark setup stay outside those measured intervals. Cold runs
invalidate furniture caches; warm runs retain the preceding cold run's caches. They exercise physical
surface contacts and equal final projectile state; this particular contact leaves zero paint marks in both
versions. The physics fixture separately checks real breakable objects and visibility.

| Uninstrumented component sample, median across repetitions | Reference | Scalar copy |
|---|---:|---:|
| Construct 57,120-triangle production grid | 27.0 ms | 14.8 ms |
| Construct 18,900-triangle production grid | 8.0 ms | 4.8 ms |
| Construct 16,128-triangle controlled-sphere grid | 10.25 ms | 4.8 ms |
| Cold local Darts/Marks first update | 78.15 ms | 56.3 ms |
| Cold local Darts/Marks sum of 60 updates | 91.0 ms | 66.4 ms |
| Warm local Darts/Marks first update | 16.3 ms | 17.35 ms |
| Warm local Darts/Marks sum of 60 updates | 31.05 ms | 30.95 ms |

The warm samples establish no improvement; do not extrapolate the cold component gains to the apartment's 625 ms,
rendered FPS, remote-cache readiness or the physical phone. The remaining synchronous allocation/binning,
private-bound scans and other ray paths still exist. #715 remains open.

Phase driver: **35 PASS**, exit 0, no page errors. Copy driver: **93 PASS**, exit 0, no page errors.
Actual `marksphysicstest.html`: **9 PASS**, exit 0, no page errors; real Glass/Breaker contact, large static
TriGrid, render-only hidden layer, hidden ancestors/objects and held-glass protection. The native text
screenshots were inspected; they are fixture evidence, not rendered apartment pictures.

Reproduce on the local dev server with `PLAYWRIGHT_MODULE=… CHROME_PATH=… SHOTS=/tmp/profile node tools/trigridprofile.cjs http://localhost:8873`
and `… node tools/trigridcopytest.cjs http://localhost:8873`. Detailed measured inputs, per-repetition results,
checks and inspected images are local artifacts `/tmp/lunden-trigrid715-surface/{profile.json,profile.png,copy.json,copy.png,physics.txt,physics.png}`.
The phase/copy baseline is pinned to a336e30; no historical reference is generated from the candidate itself.

After rebasing onto `0dc54e8`, the candidate copy fixture was rerun: **93 PASS**, exit 0, no page errors;
the physical Marks fixture was rerun: **9 PASS**, exit 0, no page errors. These final verification artifacts
are in `/tmp/lunden-trigrid715-surface/final/`; the earlier timing table retains the original measured samples.
