# Gull form and motion — #1924

Baseline `ad9eab1160e095847280a52c585d221a51b75cf1`, before art changes.
The actual production Birds shader submits one call/30 triangles for ten birds,
one/15 for low-memory five, with 492/372 retained attribute bytes respectively
(geometry and instance TypedArray views deduplicated by identity). No textures.
`baseline.json` binds the raw counts, inputs and hashes to the captured source.
Seven component views use the same seeded flock, fixed time, 800×600/DPR1,
70° FOV, daylight and sky background. A real-pixel blank-frame comparison rejects
empty captures. No full World or physical hardware timing is claimed.

## Budget locked before art changes

At most two submitted flock calls for a mixed LOD, far <=12 triangles/bird and
near <=400 triangles/bird; no overlap or dropped instance at the LOD boundary.
All retained unique CPU attribute/index/seed buffers for ten birds <=160 KiB,
no texture, light, physics, shadow or per-frame object/geometry allocation.
Preserve exact deterministic seeds/circle paths and all existing visibility gates.
A bounded allocation-free classification of at most the configured flock size
(default ten/five) is allowed; the shader remains motion authority. Hidden flocks
skip classification. Root agreed this tradeoff before implementation.

Baseline update medians round to zero; p95 about 0.001 ms per update in 100-call
batches. Render/gl.finish medians about 0.1 ms, p95 0.1–0.2 ms, close to timer
resolution. Proposed absolute local update guard median <=0.05 ms/p95 <=0.1 ms;
render p95 <=1 ms for this tiny component. The guards are engineering budgets,
not predicted native GPU speed or phone FPS. If exceeded, reassess before detail.

## Delivered form and scope

The first whole front/side/quarter and normal-ground proposal was opened by the
worker and root, accepted, and the art was then frozen. The near recipe has a
rounded body/head, small dark eyes and a yellow bill, swept bent wings with dark
primaries, a thin wing section and a small tail. It remains a stylized low-poly
gull, not a photorealistic animal. All new art/density/colour/motion assumptions
are in `GULL_SURFACE` before these captures. No external asset, GLB or license is
introduced, so there is no model-file attribution change.

The original 3.2 m span and additional 1.8× high-bird enlargement were visibility
guesses. Near span is now a guessed 1.6 m; a smooth distance multiplier reaches 2× at
75 m to preserve distant readability, without the extra high-bird enlargement.
These are model-art choices, not verified local species measurements. At the
same normal 70° camera, the entire flock affects 47 pixels before and after. It
remains deliberately discreet from the ground; no large visible ground-detail
improvement is claimed at that footprint. At the matched 5 m proximity view, the
smaller gull affects 1,320 pixels instead of 4,673, while showing a recognizable
body/head/bill instead of three paper-like triangles. Cameras are not zoomed to
compensate for that size change.

Shader motion preserves the exact default 10/low-memory 5 source seeds and circular
paths. It alternates gliding and short wingbeats, rolls the whole body/normal with
the turn and bends each wing at its root. An allocation-free pass over at most
`BIRDS.count` seeds selects one batch per bird at 45 m; positions/poses remain
shader-controlled. Debug `&birds=N` now clamps finite counts to 0…configured count
(default 10), so it cannot create unbounded per-frame partition work. Invalid
nonfinite input uses the ordinary 10/5 fallback. Fully hidden flocks skip the
partition, upload and motion updates. No new brain, gameplay or interaction.

BestiaryImages uses exactly the near geometry, with its existing collection
lighting and neutral glide pose. Gull-only modelVersion 2 refreshes generated
thumbnails without changing discovery IDs or photos. BestiaryObserver reads the
original source seeds once across either visible LOD, avoiding duplicate/stale
packed slots and preserving near-only observations.

## Reviewed images

All whole-model, ground, motion and collection images below were opened. Before
images are transient issue evidence; the integration owner publishes pinned URLs
before deleting `before/` in the resolving commit. Result images follow 30-day
retention.

- Whole quarter [before](before/baseline-quarter-1.png) / [after](current-quarter-1.png).
- Whole [front](current-front-1.png), [side](current-side-1.png).
- Normal ground [before](before/baseline-ground-1.png) / [after](current-ground-1.png),
  [five-bird ground profile](current-ground-1-lowmem.png).
- [Glide](current-glide.png), [upstroke](current-up.png),
  [downstroke](current-down.png), [opposite bank direction](current-bank-opposite.png).
- [Actual collection image](current-binder.png),
  [actual low-memory cleanup followed by near redraw](current-lowmemory-near.png).

## Scoped checks and costs

Nine targeted Node checks pass: four existing catalogue/observer checks plus five
new geometry/LOD/gating/near-only observer/bounded-count checks. Geometry and full
model/camera/projection matrices are finite. The actual GPU fixture compares
rendered pixels with a blank frame; current normal/near views also require pixels
within 32 px of the intended centered gull. Counts are real renderer submissions,
not raw mesh totals or hidden-LOD sums.

| Actual frame, desktop 10 unless noted | Baseline calls / triangles | Current calls / triangles |
| --- | ---: | ---: |
| Normal ground, all far | 1 / 30 | 1 / 120 |
| Matched proximity, one near/nine far | 1 / 30 | 2 / 348 |
| Two near/eight far | 1 / 30 | 2 / 576 |
| Near-only diagnostic, ten | n/a | 1 / 2,400 |
| Low-memory ground, five far | 1 / 15 | 1 / 60 |
| Fully gated | 0 / 0 | 0 / 0 |

Far is 12 tri/bird; near 240, below the locked 12/400 limits. Raw unique retained
CPU attribute/seed/ID views are 31,040 B for ten and 30,640 B for five, below 160 KiB.
Both LOD recipes, original seeds, packed seeds and IDs are included, shared views
counted once. No textures, scene lights or shadow casters are added. These bytes
are not total browser heap/GPU memory, asset transfer or shader-program storage.
One-time geometry construction/startup was not benchmarked.

[Raw matched views and warm intervals](current.json), [baseline](baseline.json),
[actual consumer/gating/LOD results](consumers.json),
[actual low-memory cleanup](lowmemory.json), [Node output](node-tests.txt) and
[final source mapping](source-equivalence.json) and
[relevant configuration values](config-inputs.json) retain the inputs and limits.
Native and browser partitions sum to the flock count with unique IDs through
44.99/45.01 m crossings. Night, the shared rain/snow strength gate, whiteout,
underground and far range produce zero actual calls/pixels. A high gull has zero
center pixels below the opaque cloud deck and 556 above it. This controls the
actual Birds shader inputs; it is not a new full World/weather-driver test.

The real low-memory module is loaded with `?lowmem` and its cleanup runs before a
fresh renderer's first upload. Dynamic seed attributes protect both recipes from
normal packing/CPU-array freeing; all arrays remain intact, five birds redraw
nearby, and the collection recipe keeps its CPU attributes. This is browser-profile
evidence, not a physical phone test.

Ten warm plus 30 measured static render/`gl.finish` intervals use the same fixed
camera/time/input and renderer as the baseline. CPU updates use 100-call batches
with dt 0 to freeze the view, so the new partition path is measured without scene
or camera drift. Current desktop update medians are about 0.001–0.002ms/p95 ~0.002 ms
versus baseline median rounding to 0/p95 ~0.001 ms; low-memory ~0.001/~0.001 ms.
Render medians 0–0.1 ms/p95 0.1–0.2 ms remain close to timer resolution and pass the
absolute guard. The small new CPU work is explicit; no speedup, frame pacing,
native GPU, phone FPS or battery improvement is inferred from SwiftShader.

After captures, only a debug-count constructor clamp changed executable code;
[exact reconstruction hashes and default-input identity](source-equivalence.json)
show all geometry/material/motion/LOD/update code unchanged. One config header
comment was corrected between consumer and final-view captures. The ninth native
check covers supported/default count identity and oversized/nonfinite inputs.

Reproduce with the existing local fixture server serving cached Three r170 on 8202:

```sh
node --test tools/gullsurfacetest.mjs tools/bestiarycatalogtest.mjs
PLAYWRIGHT_MODULE=/path/to/playwright tools/browsertest.sh node tools/capture-gull-quality.cjs http://127.0.0.1:8202 docs/verification/1924 current
PLAYWRIGHT_MODULE=/path/to/playwright tools/browsertest.sh node tools/verify-gull-consumers.cjs http://127.0.0.1:8202 docs/verification/1924
PLAYWRIGHT_MODULE=/path/to/playwright tools/browsertest.sh node tools/verify-gull-consumers.cjs http://127.0.0.1:8202 docs/verification/1924 lowmemory
```

`capture-gull-quality.cjs … baseline` routes the original source at the baseline
revision. The existing full-World `birdstest.cjs` assertions were adapted for both
LOD budgets, but that broad repeated-startup script was not rerun for this change.

Public transfer is not applicable: gulls are outside the public project's explicit
generic-animal exception. No gull feature/port issue is created there. Root remains
the sole integration/publishing owner and must verify actual workflows and embed
accessible revision-pinned before/result images before closing #1924.


Root reviewed the combined production/fixture/consumer diff and opened final whole, normal ground, collection and actual low-memory images. Rebase preserves all measured bird model/consumer/fixture files and exact BIRDS/GULL_SURFACE sections; [integration mapping](integration.json) binds delivery. Changelog1483 assigned after the latest main fetch.
