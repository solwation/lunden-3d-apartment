# Issue #714: Nerf range and confirmed hit sound

The Nerf projectile and hit predictor share a 25 m travel limit, 30 m/s launch speed and 4 m/s² gravity. The Worker uses the same 25 m range limit. These three gameplay values are marked `guess` in config. Prediction uses the fired muzzle/direction/speed, clips at the same floor and chooses the first capsule contact before a wall. Travel is accumulated segment chord length, so different time steps agree within tolerance rather than exact continuous arc length. Bow/rifle rules are unchanged.

A server-confirmed Nerf hit adds one nonpositional two-tone cue through the existing audio readiness/mute path. Misses and denied shots do not get that cue. No protocol messages were added.

## Apartment obstacle cost and cooperative validation

The retained actual apartment was loaded once on this Linux i7-7660U (2 cores/4 threads), with its animation loop stopped. Actual production Ghost capsules were staged 22 m east/west of `[-20.85,1.5,21.62]`. These are obstacle-validation CPU/elapsed-time tests, not rendered FPS, live multiplayer latency or physical-phone measurements.

The first synchronous candidate implementation took 314.8 ms median for a blocked shot (20 repetitions). Private conservative spatial buckets and per-shot instanced selection reduced the later synchronous 8-direction diagnostic to roughly 17–33 ms medians. Final Nerf `Combat.fire` uses cooperative validation even when warm, instead of placing that work in one UI task.

Final source was hot-imported into the retained scene, with its actual function source checked after import. Two simultaneous 22 m paths used the production 2 s deadline:

| State | Result | Elapsed | 5 ms heartbeat | Largest heartbeat gap | Largest validation slice |
| --- | --- | ---: | ---: | ---: | ---: |
| Fresh cache | both cancelled/deadline (`null`) |2003 ms|398|10.6 ms|2.2 ms|
| Relevant paths prepared | both unobstructed (`false`) |886.1 ms|174|10.1 ms|2.4 ms|

A separate **preparation diagnostic**, allowed 30 s only for measurement setup, completed those two paths in 2765.6 ms with 547 heartbeat ticks. It admitted 46 additional relevant spatial-ready entries and used about 500 ms additional builder CPU. That diagnostic is not the production deadline or normal hit latency. The final warm test had 52 relevant spatial-ready entries; it did not require all 737 scene entries to finish.

The 2 ms work budget is cooperative, not a hard wall-time guarantee: the final instance observed a 3.4 ms builder chunk. Earlier experiments, profiler/live-import attempts and other cache instances overlapped; their full-world preparation elapsed time and heap must not be treated as a clean production startup measurement. Failed rAF-per-slice and scheduling experiments were retained separately from the source-matched final records.

CPU slices yield with `setTimeout(0)` so timer/UI work can proceed; cache waits retain frame pacing. A cold legitimate hit can become a conservative miss at the 2 s deadline. The client sends one normal existing shot message after validation; no hit is invented through an unverified wall. Launch vectors are captured. At most 8 pending shots are kept; overflow resolves the oldest as one miss, while reset/disconnect/unarmed cancel without a late message. This changes shot delivery timing and is still unverified on a physical phone. Issue #715 remains open for that verification.

## Private cache bounds and native semantics

Private 64-bucket reordered indices use at most 16 MiB typed-array reservation and 1024 spatial entries; occupancy bitsets plus reserved bookkeeping retain the separate 1 MiB cap. The actual apartment admitted 737 entries with 13,275,200 bytes spatial typed reservation and 524,288 bytes bitmap storage. These figures are accounting/typed storage, not measured JavaScript heap. Spatial-only entries cannot masquerade as ready occupancy maps.

Native raycasts remain authoritative for selected triangles/instances. Hit object, instanceId, face/faceIndex, UV, normal, tie ordering, authored bounds and original drawRange/group data are preserved. Unsafe custom/deforming/grouped/partial cases use conservative native fallbacks. Buffers/versions invalidate entries; disposal releases reservations. Removing geometry without disposal can consume the lifetime admission quota and safely fall back. No render geometry/list or draw calls are added by this acceleration.

## Focused checks

- `tools/combatworldtest.html`: **459 PASS**, actual Three without WebGL. Covers metadata/equivalence, curved paths, scalar indexed/nonindexed spatial views, grouped/partial fallback, instancing/transforms/authored spheres, bounds ownership, mutation/disposal/quotas, boundaries, cooperative cancellation/deadline/yield and urgent-owner release.
- `tools/nerfcombattest.html`: **32 PASS**, small rendered actual-module scene with two production Ghosts against a real local Worker. Covers 22 m visible trajectory, floor/range termination, capsule/wall order, Worker denial, real WebAudio two-tone/nonpositional/mute. Its separate transport-spy checks cover `Combat.fire` snapshot/defer/send-once/reset/disconnect/unarmed/deadline/queue lifecycle; those spy checks are not Worker-network evidence.
- Original `tools/nerftest.html` is preserved unchanged. Its **7 PASS** assertions were replayed on the retained actual apartment with final Darts stepping: local paint colour, flight, wall splash, spent fall and fade.
- `node --test cloudflare/players.test.mjs`: **10 PASS**, including 22 m allowed and 33 m denied Nerf shots.

The rendered fixture image shows the small module scene, with the dart enlarged for visibility. It is not an apartment UI screenshot or a physical device image. Root reviewed source and the rendered fixture before publication.

Local evidence retained under `/tmp/lunden-714-shots`: `source-matched-check.json`, `source-matched-cold.json`, `source-matched-setup.json`, `source-matched-warm.json`, `fixture-release-result.json`, `nerf-fixture.png`, `splash-final-source.json`. The final noGL fixture log is `/tmp/lunden-714-helper-release-result.txt`.
