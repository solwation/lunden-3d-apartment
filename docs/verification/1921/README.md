# Mallard anatomy and plumage — #1921

Baseline `8354644a54a99b10584469bd2b27eea94f07e25d`. These are authored visual
estimates, not a scientific reconstruction. Profiles/tessellation lived in central
`DUCK_SURFACE` before final capture. Remaining colour thresholds were then moved
into that block without altering measured output: all four sex/rig combinations
and the re-exported neutral GLB are byte identical. [Exact proof](config-identity.json)
links the [measured source hashes](measured-source.json) to [delivered hashes](source.json).

The head/bill taper forward instead of ending in a round ball. The neck starts
inside the breast, wings lie flatter against the body, the tail fans low and the
feet have a triangulated web outline. Small eyes, the drake collar, female eye
stripe, subdued vertex feather variation and blue wing patch keep both looks
identifiable. These remain stylised: part transitions, broad interpolated colour
patches and silhouette facets are visible close up; individual fine feathers and
photorealism are not claimed.

The shared art recipe now supplies live rigged, missing-asset fallback and
collection surfaces. That replacement also removes the old consumer divergence
reported separately as #1931; that issue remains separately tracked for assessment.
Discovery IDs/photos are unchanged; generated thumbnail version is now 2.

## Three focused risk groups

1. **Matched whole and actual normal views.** The real Ducks constructor, loaded
   GLB skeleton, both sex geometries, native mixer/clips and write path run on
   controlled land/water. Camera/light/scale/viewports are identical per view.
   Whole front/side/quarter use 40°; normal eye height is 1.62 m, 70°, 3.5 m from
   the front pair, with all four real birds shown. Near uses 70° at 1.05 m/1.5 m.
   Nine matching views plus actual BestiaryImages 96/320 are captured per phase.
   Full scene/camera matrices are finite; the actual intended birds intersect
   the frustum and submit exactly one draw each. All final pictures were opened.
2. **Contacts/rig/consumer preservation.** Ten targeted native tests pass for the
   actual 14-bone/five-clip model, neutral skinning, finite deformed envelopes,
   exact idle bill contact, real kissing contact, both sexes, four-bird budget and
   unchanged flock range/gating. Only obsolete 640/1,000-triangle assertions were
   changed to the pre-locked 1,600 limit. Land, swim, waddle, flap and eat were
   inspected. Bill z/y/half-height remain exactly 0.5541267991065979 /
   0.5800000131130219 / 0.010815590620040894 m. Source normals are finite/unit;
   fallback and rigged position/normal/colour/index arrays are identical for both
   sexes. Actual GLB 404 keeps four finite, visible native fallback birds in three
   land/water/normal views, without page errors. Both real collection entries
   render at 96 and 320 pixels (four renders per phase; zero rejected).
3. **Submitted/retained costs and timing.** Same actual four birds, scene,
   graphics/camera/renderer/DPR. See tables and limits below. These are bounded
   component scenes, not full World or physical phone/GPU measurements.

| View | Before | After |
| --- | --- | --- |
| Whole quarter | [before](https://raw.githubusercontent.com/solwation/lunden-3d-apartment/a963287ffaacad8fa405f91c086752255aefcb2d/docs/verification/1921/baseline-quarter.png) | [after](current-quarter.png) |
| Front | [before](https://raw.githubusercontent.com/solwation/lunden-3d-apartment/a963287ffaacad8fa405f91c086752255aefcb2d/docs/verification/1921/baseline-front.png) | [after](current-front.png) |
| Side | [before](https://raw.githubusercontent.com/solwation/lunden-3d-apartment/a963287ffaacad8fa405f91c086752255aefcb2d/docs/verification/1921/baseline-side.png) | [after](current-side.png) |
| Normal four-bird view | [before](https://raw.githubusercontent.com/solwation/lunden-3d-apartment/a963287ffaacad8fa405f91c086752255aefcb2d/docs/verification/1921/baseline-normal.png) | [after](current-normal.png) |
| Near feeding distance | [before](https://raw.githubusercontent.com/solwation/lunden-3d-apartment/a963287ffaacad8fa405f91c086752255aefcb2d/docs/verification/1921/baseline-near.png) | [after](current-near.png) |
| Swim/water depth | [before](https://raw.githubusercontent.com/solwation/lunden-3d-apartment/a963287ffaacad8fa405f91c086752255aefcb2d/docs/verification/1921/baseline-swim.png) | [after](current-swim.png) |
| Waddle | [before](https://raw.githubusercontent.com/solwation/lunden-3d-apartment/a963287ffaacad8fa405f91c086752255aefcb2d/docs/verification/1921/baseline-waddle.png) | [after](current-waddle.png) |
| Flap | [before](https://raw.githubusercontent.com/solwation/lunden-3d-apartment/a963287ffaacad8fa405f91c086752255aefcb2d/docs/verification/1921/baseline-flap.png) | [after](current-flap.png) |
| Eat | [before](https://raw.githubusercontent.com/solwation/lunden-3d-apartment/a963287ffaacad8fa405f91c086752255aefcb2d/docs/verification/1921/baseline-eat.png) | [after](current-eat.png) |
| Real collection 96/320 | [before](https://raw.githubusercontent.com/solwation/lunden-3d-apartment/a963287ffaacad8fa405f91c086752255aefcb2d/docs/verification/1921/baseline-binder.png) | [after](current-binder.png) |

Missing-asset actual fallback: [land](fallback-land.png), [water](fallback-swim.png),
[normal](fallback-normal.png), [counters](fallback.json).

## Costs

| Scope | Before | After |
| --- | ---: | ---: |
| Draws per loaded bird | 1 | 1 |
| Loaded male/female triangles | 960 / 896 | 1,312 / 1,312 |
| Four loaded birds, triangles | 3,712 | 5,248 |
| Controlled four-bird scene, calls/triangles | 5 / 3,714 | 5 / 5,250 |
| Male/female runtime geometry | 54,360 / 50,736 B | 51,912 / 51,912 B |
| Male/female retained fallback geometry | 23,280 / 23,280 B | 34,296 / 34,296 B |
| Decoded GLB template retained alongside runtime | 54,360 B | 51,912 B |
| All unique retained raw geometry views, four birds | 206,016 B | 224,328 B |
| Neutral GLB download | 62,808 B | 60,324 B |

The two sexes each share one fallback and one runtime geometry across the flock.
The unused decoded GLB template remains retained by the existing loader and is
counted separately, not omitted. Raw costs include all attribute/index views;
bones/objects/renderer heap and total GPU allocations are excluded. There are no
textures, new lights, material layers or geometry allocations per frame. All
per-surface and total raw values remain within the pre-implementation 1.8× cap,
and 1,312 triangles stay below 1,600. All retained raw totals increase 8.89%; fallback
raw per sex increases 47.32%. Four-bird submitted triangles increase 41.38%.

Single browser construction observations (actual Ducks constructor plus four
native setupRigged calls) are 19.5→34.7 ms; this is an up-front cost, not warm
frame time. After ten warm-up samples, 30 matched samples at 640×480/DPR1 include
actual four-bird update/render/gl.finish. Update median/p95 is 0.1/0.3 ms both;
combined median is 0.4 ms both and p95 1.0→3.1 ms. Software timing is noisy near
clock resolution and includes stalls; no native FPS, speedup or phone-budget
claim follows. Increased submitted geometry is stated rather than hidden.

[Before buffers](baseline-buffers.json), [after buffers and exact contact/parity](current-buffers.json),
[before browser](baseline-browser.json), [after browser](current-browser.json),
[native test output](node-tests.txt), [source hashes](source.json).

```sh
node --test tools/riggedducktest.mjs tools/duckkisstest.mjs tools/duckrangetest.mjs
PLAYWRIGHT_MODULE=/path/to/playwright tools/browsertest.sh node tools/capture-duck-surfaces.cjs baseline
PLAYWRIGHT_MODULE=/path/to/playwright tools/browsertest.sh node tools/capture-duck-surfaces.cjs current
PLAYWRIGHT_MODULE=/path/to/playwright tools/browsertest.sh node tools/capture-duck-fallback.cjs
```

Serve this checkout at 127.0.0.1:8200 with cached Three/Playwright dependencies.
The before tool routes only original duck model/config/runtime/GLB from the pinned
Git revision. The fixture exposes the real producer with controlled flock state;
its new fallback query only skips successful GLB setup when explicitly requested.
Public transfer uses its own low issue, anonymous ambient producers and own images;
feeding/kissing/rewards/audio/services are original-only.

Ten local before images were pruned at closure. Their comparison links are pinned
to the delivered evidence revision; metrics remain and current results follow the
30-day policy. [Reviewed issue results](https://github.com/solwation/lunden-3d-apartment/issues/1921#issuecomment-6819932772).
