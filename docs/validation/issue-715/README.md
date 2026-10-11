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
