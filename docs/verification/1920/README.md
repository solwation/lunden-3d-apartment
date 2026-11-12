# #1920 — continuous squirrel surfaces

Baseline: `84c6317de7aaf126f22365a5f2aa0d059dde6822`. Capture/build source SHA256s
are in [source-manifest.json](source-manifest.json); the exact geometry/resource
measurements also record their source hashes. The same authored surfaces supply
the exported neutral GLB, all ten actual production looks and the binder factory.

The trunk and tapered face now form connected volumes with smaller, inset eyes.
The tail is one closed curved plume, rooted into the rump, with a filled rounded
tip and shallow fur flow, rather than overlapping little locks/core segments.
The early flat-leaf and heavily creased candidates were rejected. The final shape
is still a stylized, texture-free squirrel; this is a visible anatomy/silhouette
improvement, not a claim of photographic fur. Art/density estimates live in
`SQUIRREL_SURFACE`, independently of the unchanged gameplay/contact dimensions.

## Three scoped checks

1. **Matched visual consumers.** `tools/capture-squirrel-quality.cjs` uses the real
   `Squirrels` constructor and `pose()` with fixed ground/one tree, fixed lights,
   1500×800 canvas, DPR1, 40° whole views or 70° standing-eye view (eye 1.62 m), and
   the same first three configured individuals, scales and camera in both runs.
   Nine front/side/quarter/normal/run/climb/eat/flick/far views passed. Two actual
   maximal head turns were checked separately. Every view checks finite full
   model and camera matrices, intended model mode, visible parents and camera
   frustum intersection, plus exactly three submitted squirrel calls. All result
   images were opened: the continuous body/head and filled tail read in whole and
   normal views; pale tips, slim dark form, foot surfaces and carried nut remain.
2. **Variants, rig and fallback.** All ten registered recipes produced actual
   `BestiaryImages` at 96 and 320 pixels (20 renders, explicit expected count and
   opaque-pixel guard). `modelVersion:2` invalidates only squirrel thumbnail
   caches; collection IDs, discoveries and photographs stay intact. Three
   intentionally missing-GLB views rendered the fallback near/eat/far model.
   Four focused Node tests passed: GLB validity, 25 bones / 5 clips, all 20 look/LOD
   shared surfaces with finite fallback morphs and neutral binding, and all five
   clips across all ten looks/two LODs at 13 sample times with finite full matrices
   and bounded deformed silhouettes. Mouth and left/right paw-joint world
   anchors in all nine matched views are exactly equal to the baseline JSON.
   Existing AI, nut sources, feeding/sync, distance gating, rest/flick centreline,
   animation clips and sole pose authority were not changed. The large nut and
   its existing position are visible in both before/after eat images; no new
   biological contact claim is made about that established gameplay pose.
3. **Cost.** Unique geometry caches include all ten looks, both rigged and
   retained fallback geometries and all three position+normal morph targets.
   The one-time colour cache removes repeated colour conversion inside each
   tail's vertex loop. All 40 rig/fallback geometries, including every morph and
   attribute/index byte, were proven identical before/after this cache; hashes
   are retained in [colour-cache-geometry-hashes.json](colour-cache-geometry-hashes.json).
   No per-frame geometry work, texture, light or material cache was added.

## Comparable costs

The budget was fixed before editing: one call, at most 4000/1600 near/far triangles,
and at most 1.3× corresponding total retained geometry views
(7597200/3426072 B). The final shape stays below the original costs and these caps.

| Metric | Baseline | Final |
| --- | ---: | ---: |
| Calls per visible squirrel | 1 | 1 |
| Submitted triangles, near / far | 3382 / 1396 | 3062 / 1228 |
| Ten near fallback geometries, including morphs | 3698880 B | 2237880 B |
| Ten near rig geometries | 2145120 B | 1324920 B |
| Combined ten near views | 5844000 B | 3562800 B |
| Ten far fallback geometries, including morphs | 1670280 B | 1016520 B |
| Ten far rig geometries | 965160 B | 597480 B |
| Combined ten far views | 2635440 B | 1614000 B |
| Separately loaded neutral GLB geometry views | 214512 B | 132492 B |
| Total near+far caches+neutral geometry views | 8693952 B | 5309292 B |
| Binary GLB resource | 229824 B | 147840 B |

Geometry figures count unique typed-array views (index, attributes and morphs),
not the entire JS heap, backing GLB buffer, inverse bones, clips or total GPU
memory. GLB transfer bytes are separate. Hidden fallback geometry remains in
the count even after successful loading. No new texture is used. The historical
three-to-one draw saving was unsupported: the baseline already submitted one.
The measured scene is three squirrels plus one 2-triangle ground call: near
4 calls / 10148→9188 triangles, far 4 calls / 4190→3686 triangles. Eating adds the same three external
nut calls / 972 triangles in both revisions. Culling-hidden animals are not counted as
submitted figures. [Baseline buffers](baseline-buffers.json),
[final buffers](final-buffers.json), [browser samples](browser.json).

Warm timings use the actual `Squirrels.pose()` path for those same three running
animals, fixed 640×480 / DPR1, same component camera/light/ground, eight warmups and
30 samples per LOD, Chromium 1248 / SwiftShader. Rendering includes `gl.finish()`.

| Milliseconds, median / p95 | Baseline near | Final near | Baseline far | Final far |
| --- | ---: | ---: | ---: | ---: |
| Pose update | 0 / 0.2 | 0 / 0.1 | 0 / 0.1 | 0 / 0.1 |
| Render + finish | 0.2 / 0.5 | 0.3 / 0.5 | 0.2 / 0.3 | 0.3 / 0.3 |

These samples approach the timer's 0.1 ms resolution and include software-renderer
scheduling noise; they do not establish a native FPS gain/regression. One cold
component-constructor observation was 328.6 ms before and 203.2 ms after; these are
not repeated load-time benchmarks. The first uncached candidate was 1127 ms,
which prompted the byte-identical one-time colour-cache correction above.
This controlled production component is not a full World or physical phone
benchmark. Gameplay/brain/sync logic is unchanged and was not broadly retested.

## Evidence and reproduction

Representative result images: [quarter](quarter.png), [side](side.png),
[front](front.png), [standing normal view](normal.png), [run](run.png),
[climb](climb.png), [eat/nut](eat.png), [tail flick](flick.png),
[head left](headleft.png), [head right](headright.png), [far LOD](far.png),
[all ten binder models](binder.png), [missing GLB](fallback-quarter.png),
[fallback eat](fallback-eat.png), [fallback far](fallback-far.png).
Before images were removed at closure after their revision-pinned publication:
[whole before](https://raw.githubusercontent.com/solwation/lunden-3d-apartment/c6ac53418862497c131efba43097d806b3af95e1/docs/verification/1920/before/quarter.png),
[normal before](https://raw.githubusercontent.com/solwation/lunden-3d-apartment/c6ac53418862497c131efba43097d806b3af95e1/docs/verification/1920/before/normal.png).
[Completion with eight embedded images and green deployment](https://github.com/solwation/lunden-3d-apartment/issues/1920#issuecomment-6820354842).
Result images follow the 30-day policy. JSON/this text remain.

From a server serving the checkout on 8201 with Three.js import maps available:

```sh
node tools/buildsquirrelglb.mjs
node --test tools/riggedsquirreltest.mjs
node tools/measure-squirrel-geometry.mjs
PLAYWRIGHT_MODULE=/path/to/playwright tools/browsertest.sh node tools/capture-squirrel-quality.cjs docs/verification/1920
SQUIRREL_BASELINE=84c6317de7aaf126f22365a5f2aa0d059dde6822 PLAYWRIGHT_MODULE=/path/to/playwright tools/browsertest.sh node tools/capture-squirrel-quality.cjs /private/matched-before
SQUIRREL_VIEWS=headleft,headright PLAYWRIGHT_MODULE=/path/to/playwright tools/browsertest.sh node tools/capture-squirrel-quality.cjs /private/headturn
```

The baseline mode intercepts only the baseline squirrel/config/GLB sources from
Git; the same fixture and capture logic are used. `SQUIRREL_ORIGIN` overrides the
server origin. The supplemental head-turn views preceded the colour-cache-only
change and share its proven identical geometry. Generic surface/LOD/export
improvements are applicable to a separately scoped public low-priority port;
exclude original names/personalities and all nut/feeding/scoring/sync gameplay
and services. Root owns that port issue and original publication/integration.

## Root integration review

Root opened the final whole/side/normal/eat/climb/binder/head-turn/far/fallback
views and compared the original eat/normal images. All nine numeric mouth/paw
anchors match exactly. Main rebase preserves the relevant SQUIRRELS/PADDOCK/SITE/
WALK values; independent pony/duck art blocks do not affect these consumers.
The remaining belly colour thresholds were moved to central config after capture:
all 40 look/LOD/rig/fallback geometries including morphs and the neutral GLB
remain byte identical ([proof](config-identity.json)). A stale comment alone was
updated. [Source mapping](integration.json). Changelog renumbered to 1480 after
final main fetch; no product change requires a repeat broad test run.
