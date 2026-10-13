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


## Current private-bounds diagnosis, 2026-10-13

After `8d0da26` and `71ec067`, native Chromium measured the **current** Marks/TriGrid path at `69c5d64`. This is production `buildFurniture()` and the actual `Marks.meshes()` collector: 979 meshes, 720,463 geometry triangles, 261 cold large-mesh bounds. It is not a full apartment/renderer/phone benchmark and does not attribute the earlier 625.1 ms app spike. A preliminary manual traversal included opt-out meshes (1,028); its samples are retained separately and excluded here. Every effect repetition creates fresh Marks/Darts to avoid accumulated marks affecting later runs.

`PROFILE_REF=current ... node tools/trigridprofile.cjs http://localhost:8874` profiles the current constructor rather than the default historical `a336e30`. For the largest 57,120-triangle mesh, five instrumented repetitions gave medians 7.1 ms copy/transform and 3.6 ms binning (10.7ms total). Current Marks diagnosis is `SHOTS=/tmp/marks-cold PLAYWRIGHT_MODULE=... node tools/markscoldprofile.cjs http://localhost:8874`. Strict unique anchors add timing/count probes only in separately routed module copies; production modules provide the separate uninstrumented series. The marked path matches their exact object/material/distance/point/normal hit results, and retained queries build no bounds/grids. Eight phase repetitions and 12 uninstrumented cold/retained repetitions per segment are kept as raw samples; medians below are not additive across runs.

| Component segment | Uninstrumented cold / retained median | Instrumented cold bounds | Grid construction | Grid hits |
|---|---:|---:|---:|---:|
| Largest furniture mesh only |17.70 /2.15ms|4.25ms|11.30ms|2.55ms|
| Same segment, entire Marks furniture list |41.65 /2.35ms|29.30ms|11.50ms|2.40ms|
| Distant segment, entire Marks furniture list |32.30 /0.30ms|29.55ms|0ms|0ms|

The overlapping whole-list query rejected 257 of 261 large meshes and constructed four grids (61,440 triangles); its instrumented grid medians split 7.75 ms copy/transform and 3.75 ms bins. Native small-mesh raycasts/boxes were 0.25/0.45 ms and residual traversal/accounting 0.75 ms. The distant query rejected all 261 and built no grid: bounds still dominated. These are elapsed wall intervals around synchronous JS, with clock-probe overhead in the instrumented series; they are not measured thread CPU or GPU time. Six fresh uninstrumented actual Darts/Marks repetitions, two local darts and 60 equal updates, gave first-update median 52.50 ms and sum 60.05 ms. No before/after runtime benefit is claimed in this diagnostics-only commit.

Actual process results: current phase 35 PASS, cold-profile 109 PASS, unchanged historical TriGrid copy parity 93 PASS, all drivers exit 0/no pageerrors; real Marks/Glass/Breaker physics 9 PASS through the public runner, exit 0, no game document. Native text screenshots reviewed. Source/version hashes and raw JSON are saved before diagnostic capture where applicable under `/tmp/lunden-priority-715-followup/current-phase`, `marks-final`, `copy`, with final proof under `~/.local/state/lunden-orkester/20261013-priority/715-followup-diagnostics.json`.

This establishes a concrete next optimization target: the current private bounds scan in these components. A possible scalar extrema scan must first preserve native normalized/interleaved attribute, empty/NaN/Infinity, authored bounds, transforms, invalidation and actual-hit/projectile semantics under independent baseline parity and balanced uninstrumented A/B. Nothing in this diagnosis changes collision behavior, budget or fallback. #715 remains open; actual phone idle/one/two-shooter frame/render/transport comparison and current full-world cold-cache cost remain unverified, while further native diagnosis is startable without a new user answer.

Final diagnostics rebase `6fba51f` preserved the measured Marks/TriGrid/furniture/toys and driver bytes. The hash audit explicitly differed for `src/config.js`: incoming #875 only added COMBAT.hitMarker duration/offset, outside this component path. Measurements retain their original recorded source version rather than asserting every final source file matched.


## Scalar private-position bounds candidate, 2026-10-13

The preceding current profile selected a small measured target. The private `positionBounds` helper in `marks.js` now computes the same six native extrema in local scalars, then constructs the private Box3. It keeps attribute.getX/Y/Z (including normalized/interleaved data) and Math.min/max, so empty, NaN, Infinity and signed-zero behavior match native Box3.setFromBufferAttribute. The subsequent native world transform and Float32 padding, authored bounds, object caches/invalidation, instancing/native branches, TriGrid and hit decisions are unchanged. There is no new timer, quota or fallback.

Independent reference: **unchanged `c269a6c6ca37e3b7361669fca63bffa0e60c18ee:src/marks.js`**, loaded by `COMPARE_REF=c269a6c6ca37e3b7361669fca63bffa0e60c18ee SHOTS=/tmp/bounds-candidate PLAYWRIGHT_MODULE=... node tools/markscoldprofile.cjs http://localhost:8874`. The scalar helper is exported only by a tools-routed module copy for direct native bounds checks, not by production. Clock probes remain separately routed. Twelve cold/retained samples per segment alternate six reference-first/six candidate-first; eight natural-RNG Darts samples alternate four of each. No vertex counters, RNG replacement, fits trace wrappers or internal clock probes occur in these timing runs.

| Uninstrumented median, ms | Reference | Candidate |
|---|---:|---:|
| Largest furniture mesh, cold |14.90|17.90|
| Largest furniture mesh, retained |1.75|1.75|
| Entire actual Marks furniture list, overlapping cold |38.85|30.00|
| Same overlapping retained |2.20|2.25|
| Entire list, distant cold |25.85|17.30|
| Same distant retained |0.30|0.30|
| Actual two local Darts, first cold update |48.05|37.20|
| Sum of 60 Darts/Marks updates |54.25|44.65|

The single-largest-mesh case regressed 14.90→17.90 ms in this series; no universal improvement or warm benefit is claimed. These are controlled furniture-component synchronous wall intervals, not phone frame/FPS figures, and they do not attribute or remeasure the earlier 625.1 ms apartment spike.

One initial natural-RNG comparison completed **166/167 checks, exit 1**, with identical projectile states but splash/mark count 0 versus 1. That raw failure remains in `bounds-candidate/`; its exact RNG sequence was not captured, so its precise cause is not proven. Thirty-two unchanged-reference versus itself full Darts pairs subsequently produced 0/0 splashes. A separate unchanged Reference.add probe at the exact original Darts edge hit `(0.40134066611528396,0.8498398646859429,11.507691348919327)` accepted 1 and rejected 91 of 92 natural decal choices; every actual size/angle/fits result is retained. This establishes reference behavior variability at that input, without pretending to reproduce the first failed sequence. The second actual edge point rejected all 512 choices.

The measured candidate run completed **185 PASS, zero FAIL/pageerrors, actual exit 0**. The final published-driver revision completed **187 PASS, zero FAIL/pageerrors, actual exit 0**: only its probabilistic natural-variation gate was replaced by three deterministic expected True/False `Reference.fits`/candidate cases using the actual saved point, normal, size and angle. Natural probes remain diagnostic, and the complete eight recorded/replayed Darts/splash/fits parity pairs remain intact. The table above uses the retained 185-run natural timings on byte-identical product code, not traced/replayed timings from the new regression cases. Exact native extrema and transformed boxes cover empty/signed-zero/NaN/Infinity/normalized int16/interleaved offset+stride/normalized interleaved/large Float64 coordinates. Full cold/retained reference hits match object, material, distance, point and normal. The original edge scenario is retained: eight separate parity pairs replay the same 2227 recorded Math.random inputs in both paths and compare every active count, final projectile state, splash/mark count and actual fits size/angle/result. Those deterministic inputs are explicitly tools-only parity inputs; their traced timings are not benchmark evidence. Natural timing series remain separate and preserve their actual splash counts. No splash assertion was removed or normalized away.

Additional unchanged public regressions: independent a336e30 TriGrid/actual Darts copy 93 PASS, Marks broad-phase/transforms/authored boxes/invalidation/moving-native contact 10 PASS, actual Marks/Glass/Breaker physics 9 PASS through public runner, all actual exit 0/no reported pageerrors. Candidate3/copy-final/broad-final native text images were inspected. Raw results/hashes/traces/random tapes are in `/tmp/lunden-priority-715-followup/bounds-candidate-3`; earlier failed/diagnostic attempts are retained. Final 187-run JSON/PNG/source hashes are retained in `bounds-final`; final rebase/source proof is recorded separately. No full apartment, reciprocal Worker or physical-phone comparison was performed for this scalar scan. #715 stays open for current full-world/cache/visible-effect/phone acceptance; this is only a measured, semantically checked cold-component mitigation.

The candidate's controlled final rebase to `327ae5f` retained six of seven measured source/driver hashes exactly. The explicit mismatch is `src/config.js`: incoming #873 only adds PVP_SCORE/pvpHitPoints; no measured Marks/TOYS/furniture/collision values changed. The retained timing/parity run was performed on the recorded `c269a6c6` base plus this candidate, rather than a new complete app test on final main.

Final push rebase `bc5c46f` preserved all seven source/driver hashes from the stable 187-run exactly; incoming changes were outside this native component path. This final hash claim is specifically for that run, while the earlier 185-run benchmark retains its separate explicit PvP-config mismatch/version record.


## Current actual-apartment diagnosis after scalar bounds, 2026-10-13

One bounded actual apartment run at `d962618bca9051eeb96e106f6cfda50b4fd77c27` completed Node/externally bounded wrapper exit 0 in 57.565 s. No `&test`: original `?shot&quality=0&mp=0&time=12&weather=clear&mess=0`, 480×300, Chromium/SwiftShader. The native automatic-loop registration alone is paused; the same production player spawn/blaster, actual Blaster→Darts→Marks and same-browser injected Combat.remote→Darts→Combat.reach run. This is **not** two browsers, reciprocal WebSocket combat, server hit/head approval or a physical phone. No production runtime changed in this diagnostics step.

The driver records full 1299-file hashes and original/served-main hashes before launching Chrome; phase/cache/obstacle checkpoints and final result are written before screenshot. During the run all hashes match, pageerrors 0, testMode false, loading/menu covers hidden. Real DetailCuller and quality 0 mirror policy run before each draw; final native GPU commands complete before capture. Both actual dart groups have all four child render-layer checks true and are in view (NDC local 0.124/−0.149/0.920; incoming −0.105/−0.193/0.898). Reviewed `/tmp/lunden-priority-715-app/apartment-two-darts.png` shows the actual apartment, held Nerf and tiny effects. This provides scoped real-render evidence, not phone performance certification.

Five fixed phases each drive 60 effect steps at 1/60 s and two manual renderer calls; shot phases emit five shots per shooter. Cold phases explicitly invalidate local Marks caches; retained phases reuse them. Incoming effect TTL remains 600 s to avoid host-delay expiry, as in the original probe. A bounded 30 s scheduler window occurs before local-retained phases. Natural RNG remains unmodified. These are single contextual current observations, **not a before/after comparison** with the older 625.1 ms sample or the preceding no-renderer furniture component.

| Effect-update elapsed wall interval, ms | First | Median | p95 | Max | Sum of 60 |
|---|---:|---:|---:|---:|---:|
| Idle/no shots |0.0|0.0|0.1|0.1|0.5|
| One local, cold Marks |90.4|1.9|7.0|90.4|210.5|
| Local + injected incoming, cold Marks |93.9|11.4|35.7|93.9|728.8|
| One local, retained Marks |3.0|1.4|3.3|4.2|94.0|
| Local + incoming, retained Marks |31.8|17.9|37.0|45.4|1014.5|

The two-source retained phase was slower than its cold-labelled phase in this contextual series; no remote warming or universal improvement is claimed. Pending approval effects remained zero. Actual active counts/final state, splashes and all 60 intervals are retained rather than normalized.

### Cache readiness and obstacle deadline

The scheduler window actually elapsed 30000.7 ms. Aggregate remote cache state remained 804 pending/0 bitmap-ready; spatial-ready progressed 0→1. Reported builder-work accumulation increased 1280.6 ms during that gap (metric name `buildCpuMs`, but accumulated elapsed wall slices rather than measured thread CPU). Maximum observed builder slice was 2.2 ms before the later obstacle promotion. The scene has 14,169,196 accounted spatial bytes across 804 entries plus 1,048,576 accounted bitmap/bookkeeping bytes; these are accounting figures, not JS-heap measurements. No truly remote-warm phase occurred.

Two-source cold queries added 35,975 pruned and 2995 native-fallback counters; retained added 36,005/2965. These aggregate counts do not identify a particular mesh as the bottleneck. The unchanged 2 s obstacle query returned null after 2002.2 ms. lastPath was **deadline/cache**, active intervals 9.1 ms, yielded 1992.3 ms, cache-wait subset 1991.9 ms, maximum active slice 2.0 ms, 55 promoted caches, deadline overrun 2.1 ms. Spatial-ready rose to 13, bitmap-ready remained 0. This is predominantly waiting for caches, not a synchronous 2 s raycast or thread-CPU/GPU measurement.

### Render-call observations and limits

The first manually submitted idle renderer call in this loop-paused fixture took 4489.3 ms: the transparent native shadow observer accounted 242.5 ms, with 4246.8 ms remaining in the outer render-call interval. Nested offscreen/initial renderer work also occurs; this remainder is **not** isolated main-scene-only GPU or CPU time. The initial draw counts were 209 calls/528,932 triangles; the second idle draw was 484/929,020. The normal warm-up phase was not sampled. This call must not be treated as an ordinary gameplay frame, phone-lag cause, shot-effect cost or fixed-workload idle/shot rendering delta.

Subsequent manual render calls were 8.9–20.7 ms elapsed wall. The one-source draws were 486–487 calls/929,084–929,204 triangles, two-source 488–489/929,148–929,268. Native shadow state was enabled, autoUpdate false, needsUpdate false after the first call; subsequent shadow observer intervals were 0–0.1 ms. No mirror was selected at production quality 0. The final capture call was 12.6 ms before gl.finish. These call intervals include submission/driver effects and are not measured thread CPU, GPU execution, full main-frame times or FPS.

Reproduce with `PLAYWRIGHT_MODULE=... SHOTS=/tmp/nerf-apartment node tools/nerfapartmentprobe.cjs http://localhost:8874`, serving this own checkout with tools/devserve.py. A finite external 240 s guard also supervises cleanup; timeout/SIGTERM is never green even if an internal completion file says 0. Raw result/provenance/checkpoints/completion/run log and inspected PNG are retained in `/tmp/lunden-priority-715-app`; stable process/source proof is `~/.local/state/lunden-orkester/20261013-priority/715-app-proof.json`. All own Node/browser/server processes and the temporary Chrome profile were removed before releasing the shared heavy slot.

#715 remains open. The current observed local cold spike and unready incoming/obstacle caches are concrete remaining investigation targets; choosing another change requires geometry/cache-stage attribution and a finite new scope. There is no extra user answer blocking that technical diagnosis. Full reciprocal visible-PvP/render/transport and physical-phone idle/one/two-shooter acceptance remain separate, unfinished requirements. This step ends at documented diagnosis, not an unlimited optimization chain.

Final diagnostics rebase to `73757cc` differs from the executed 1299-path freeze in six files: README, this validation/performance/verification documentation and unrelated ghostlivestest/recoverytest drivers from #881. Additional incoming tracked files are recorded in the proof; no measured src/data/cloudflare/index runtime or nerfapartmentprobe driver differs. The execution remains explicitly attributed to `d962618b`; no repeat app run on final main is claimed.


## Cache queue selection remedy (2026-10-13)

The preceding actual apartment observation remains the motivation, not this component's geometry or benchmark: 804 pending, zero bitmap-ready and one spatial-ready after a 30-second scheduler window. Source inspection identified concrete repeated work. Each bounded vertex/triangle/cell operation searched the full queue for urgency before continuing the same selected job. With hundreds of entries, that repeated linear search can consume most of a 2 ms callback. Separately, the existing scheduler deliberately prioritizes **all unfinished spatial views before bitmap filling**; zero bitmap-ready does not establish a stalled bitmap phase.

`tools/combatcachetest.cjs` obtains **unchanged `38c49d8:src/combatworld.js` through git show**, serves historical/current modules to its native actual-Three fixture, and intercepts only idle/animation callback delivery. Work operations, cache admission, geometry, raycast algorithms and budgets retain their production implementation. Representative geometry is one 3,968-triangle sphere and 803 independent 224-triangle spheres: **183,840 triangles**, 804 spatial entries, 4,561,296 accounted spatial bytes. This is not serialized apartment geometry and cannot attribute the earlier apartment's 14,169,196 spatial bytes or 30-second elapsed readiness. Controlled callback pumping does not measure native requestIdleCallback availability or ordinary render contention.

Before the remedy, a separate instrumented 100-callback diagnosis progressed 4,230 operations but evaluated **3,405,150 queue predicates**. Phase counts were 2,145 bounds-scan operations and 2,085 spatial-count operations; no spatial fill or bitmap fill had begun. These instrumented times are excluded from performance comparisons.

The narrow runtime change reuses the selection inside one synchronous callback. It reselects on head replacement/removal/requeue and whenever spatial completion changes priority eligibility. Urgent selection retains its original policy too. External urgency cannot interleave inside this callback. The between-operation elapsed-budget check remains in place, including every cell of a large triangle AABB. No new budget, idle/animation timer, queue order, cache representation, allocation quota, query fallback or hit algorithm is introduced.

Four uninstrumented paired repetitions reverse historical/current order. Each pumps 100 callbacks with the real production 2 ms work budget:

| Observation | Historical | Candidate |
|---|---:|---:|
| Total callback elapsed wall work |200.4–201.1 ms|205.6–208.9 ms|
| Spatial-ready entries after callbacks |3–7|143–234|
| Bitmap-ready entries |0|0|
| Remaining pending entries |804|804|

The result demonstrates greater spatial-builder throughput at roughly the same callback work allowance, not reduced thread CPU, a hard 2 ms wall bound, completed warm caches or phone FPS. The separate 72-query/parity loops after partial construction range 123.1–146.5 ms historical /95.4–136.3 ms candidate, including metadata comparison work. They are diagnostic, not a general shot-effect performance claim. Both record 57,816 prunes and 72 `fallbackQueries` increments: **that existing counter means a nonempty candidate was passed to rangedHits, including accelerated spatial traversal**, not necessarily an unaccelerated full-mesh native fallback. No counter was changed in this remedy.

**25 checks PASS, actual CLI 0, no page errors** in the native component. Complete deterministic operation arrays (not just hashes/counts) and all final bitmaps, private extrema, cluster bounds, spatial indices/original-face mapping/bounds/offsets match the unchanged historical implementation. The eight-job workload performs 301,832 identical operations: 3,216 scan /5,544 spatial count /5,544 spatial fill /287,520 bitmap /8 settlement. Queue predicate visits decrease 2,703,748→1,517; timing of this instrumented deterministic trace is not a benchmark. Independent native Three rays preserve object, face index/vertices/material, distance, point, normal and UV metadata in fully and partially ready states. Additional exact historical parity covers urgent promotion, version invalidation/requeue, NaN invalid-job settlement, disposal and leftover callbacks, plus a triangle whose AABB fills all 32³ cells while between-operation yielding remains bounded by the fixture clock. Original `combatworldtest.html`: **485 checks PASS, actual CLI 0**, including original async native path, cancellation, deadlines, authored bounds, transforms, custom/layer, instanced/group/drawRange and lifecycle behavior.

Reproduce using `PLAYWRIGHT_MODULE=... CHROME_PATH=... SHOTS=/tmp/cache-check node tools/combatcachetest.cjs http://localhost:8873`, serving this checkout with `tools/devserve.py`. Add `diagnosis` for the bounded historical-only phase probe; add `world` to run the existing combatworld fixture under the same bounded driver. Raw evidence precedes images in `result.json`, with exact source hashes and separate logic/image/cleanup/actual CLI states. Local final artifacts are `/tmp/lunden-cache715-surface/final-native-3/{result.json,cache.png}`, `final-native-3.log`, `final-native-3-exit.txt` and `world/{result.json,cache.png}` with its log/exit. Earlier component runs remain retained with their own hashes. The original world run's whitelist precedes addition of its HTML source to the driver whitelist; that HTML is unchanged from `38c49d8`, and no repeat of the world fixture is implied. Native text PNGs were inspected. No new apartment/WebGL run occurred.

**#715 remains open.** This is a reversible scheduler-work mitigation with independently checked cache/hit semantics. Actual apartment cache readiness and reciprocal visible-PvP/frame/render/transport cost, plus physical-phone idle/one/two-shooter acceptance, remain unmeasured after it. To try the published change, use Nerf with another player, compare ordinary walking before shots and the first/repeated exchanges, and observe whether the earlier shooting stalls persist; no estimated device improvement is supplied.

Final source proof after rebase retains every executed scheduler/driver/fixture/checkpoint file hash. `src/config.js` has an explicit unrelated #884 HUD_FPS export/comment mismatch; the entire `COMBAT.collision` declaration is byte-identical to execution. No whole-config hash equivalence or new apartment run is claimed. Incoming FPS/Hus A/statistics changes are preserved. Proof: `/tmp/lunden-cache715-surface/final-source-proof.json`.


## Actual apartment cache acceptance after scheduler selection reuse (2026-10-13)

`tools/nerfapartmentprobe.cjs --cache-acceptance` supplies a finite current-app scenario for the published `8237269` scheduler. It retains the existing ordinary `?shot&quality=0&mp=0&time=12&weather=clear&mess=0` entry, 480×300/DPR 1 and registration-only served main-loop pause. Native clock, requestAnimationFrame and requestIdleCallback are untouched. The same production player/blaster setup runs, with initial scene/cache state, three independent native solid rays, an actual 30-second scheduler window, the same three rays again, 60 actual Darts/Marks steps for one local and one injected incoming shot, the unchanged 2-second obstacle query and two final actual DetailCuller/quality-policy renderer calls. Native GPU commands finish before a single direct CDP PNG capture with a 15-second bound. The full tracked freeze, explicit source hashes/src aggregate, original/served main hashes, page errors and separate logic/image/cleanup/CLI outcomes are retained before capture. This is same-browser Combat.remote injection, not reciprocal WebSocket players or server-approved player hits/headshots.

The first run is **retained as failed**, actual driver and external 240-second supervisor CLI 1, not timed out, 120.895 s. Six independent native ray results had real solid hits and equal object/face/material/point/normal/UV/distance metadata. Source hashes/revision stayed frozen, page errors were zero, real 30,000.6 ms cache window ran and scene/aggregate counts agreed. Initial state: 804 pending /0 spatial-ready /0 bitmap-ready. After the window: 804 /29 /0. The scene has 3,487 unique geometries, with 3,323,020 pending position elements and 1,264,691 pending triangles; accounted spatial bytes remain 14,169,196. Builder wall-slice accumulation increased 7.9→1,367.0 ms; maximum observed slice was 5.9 ms (not a hard 2 ms bound or measured thread CPU). These pending position/triangle totals describe entire geometries whose cache entries remain unsettled, not the number of scan/triangle operations left. Spatial-first priority explains why bitmap readiness remains deferred; most spatial views remain unready.

Its 2-second obstacle request returned `false` (clear) after 1,481.7 ms; lastPath was clear/traversal, active 47.2 /yield 1,432.0 /cache wait 1,382.5 ms, 47 promoted entries and no deadline overrun. These current observations are **not a causal before/after comparison** with the other-host `7c68673` record. The two shots' 60 effect intervals are a different workload from the earlier five-shots-per-shooter phases, so their timing is not used as a performance comparison. Existing `fallbackQueries` also includes accelerated rangedHits candidates; it is not a count of exclusively full-mesh native raycasts.

The failed check was an incorrect fixture assumption of **four direct children per dart**. Current `Darts` explicitly builds `g.add(body, tip)`: two Mesh children per dart, four combined across local and incoming. The saved renderer record had both groups in view, all four combined child-layer checks true and the ordinary quality/mirror/cover guards true, but no PNG was attempted after logic failed. Therefore its stages remain logic passed:false, image incomplete, cleanup complete, actual CLI failed 1. It establishes no image acceptance. The corrected future guard requires exactly two Mesh children per group/four total and retains every layer/frustum guard; the failed result is never rewritten as CLI 0.

First-run raw result/provenance/completion/supervisor and log: `/tmp/lunden-cacheapp715-surface/run/`. Corrected-run evidence is recorded separately. No component 25/485 suite or physics scenario is repeated for this app acceptance. #715's actual reciprocal PvP/frame/render/transport and physical-phone idle/one/two-shooter acceptance remain separate.


The one explicitly authorized corrected run completed **17 checks PASS, actual driver and external supervisor CLI 0**, no timeout, **118.987 s**. All logic/image/cleanup/CLI stages are complete. Full tracked freeze and explicit files/src aggregate match during execution at source base `8237269` with the recorded validation-only driver/served-main changes. Six solid-ray comparisons again have two native/two actual hits each and equal complete tested metadata; no page errors occurred.

Corrected run's actual scheduler window was **30,000.2 ms**: initial 804 pending /0 spatial-ready /0 bitmap-ready, after-window **804 /31 /0**. Builder wall-slice accumulation was 7.9→1,352.9 ms, maximum slice 6.0 ms. The exact same scene accounting remains 14,169,196 spatial bytes across 804 entries and 1,048,576 bitmap/reserved-accounted bytes, not measured heap. This is demonstrable native progress but no fully warm cache and no causal cross-host performance result. After the window, the obstacle returned clear in **1,569.6 ms**; lastPath active 123.7 /yield 1,444.0 /cache wait 1,329.4 ms, maximum active slice 6.8 ms, 47 promoted entries and zero deadline overrun. Spatial-ready reached 78 by that checkpoint, bitmap-ready remained zero.

The one local plus one injected incoming shot produced 60 effect-only steps: first/max 331.1 ms, median 0.1 ms and sum 550.4 ms, one splash. This one-shot workload has many steps after flight ends and is not comparable to the earlier five-shot phases or to a full gameplay frame. Two final manual render calls took 11,366.4 and 39.2 ms wall, with 210/529,052 and 489/929,268 calls/triangles. Initial nested/upload/shader/shadow work may be included; these are not isolated main-scene CPU/GPU times, normal frame samples or FPS.

The single native CDP screenshot succeeded at actual 480×300 after gl.finish. Both actual local/incoming darts have two Mesh children each (four total), every child layer matches the camera, both groups are in frustum, real DetailCuller ran, quality is zero without test mode, loading/menu covers are hidden and the native quality-zero mirror policy selects none. The room, held gun and two small blue/orange dart effects are visible in the inspected/root-reviewed PNG. This image and metadata establish current rendered-scene integration for this controlled view; no full-room coverage, reciprocal player transport or physical-phone acceptance is implied.

Corrected artifacts: `/tmp/lunden-cacheapp715-surface/run-corrected/{result.json,provenance.json,completion.json,supervisor.json,driver.log,apartment-two-darts.png}`. The original `/run/` remains CLI 1/image incomplete; no result was relabeled and no third run occurred. Reproduce with `PLAYWRIGHT_MODULE=... CHROME_PATH=... SHOTS=/tmp/cache-apartment node tools/nerfapartmentprobe.cjs http://localhost:8873 --cache-acceptance` under an external 240-second process supervisor, serving the matching checkout with tools/devserve.py. The driver itself retains the 240-second bound and a separate 15-second native capture bound. Owned browsers were closed before releasing the heavy slot. This diagnostics-only delivery changes the driver/docs, not production runtime or changelog; #715 stays open for the remaining reciprocal/phone acceptance.

After execution, final rebase preserves incoming avatar appearance centralization, native Touch keyboard activation, FPS/HUD fixture deliveries and #891 remote Spider-Man appearance. Exactly 17 executed tracked files now differ: README, cloudflare/players.js, data/changelog.json; the five documentation paths interactions/performance/storage/verification/this README; index.html; src/avatar.js, src/config.js, src/ghosts.js, src/main.js, src/spidersuit.js; and fpstest/hudlayouttest/statspaneltest drivers. New tracked path: tools/spideravatartest.cjs. Measured combatworld/toys/marks/detail/plan/checkpoint and this executed apartment driver hashes still match. Config's avatarLook export is an explicit mismatch; COMBAT.collision stays byte-identical. Main/index include separate keyboard-activation/duplicate-role changes, and main's outfit receipt changes with #891. These are post-run differences, not during-run mismatches; no repeat app run or blanket final-main avatar/rendering parity is claimed. `/tmp/lunden-cacheapp715-surface/final-source-proof.json` lists every mismatch and explicit hash pair.
