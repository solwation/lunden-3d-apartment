# Cat surfaces and proportions — #1918

Compared with `7fa7fdebe0dc201dbb9b6878be3e7ca5a6e27887`, using the real
`CatSpawner`/`createCatPuppet` geometry, production coats and neutral GLB.
The authored surfaces now have recessed smaller almond eyes, a shallower muzzle,
curved pinnae, a tapered torso/haunch contour and an upper chest that joins the
head while standing. The chest and blaze are colours on continuous surfaces;
the old overlapping patch meshes retain their references but stay hidden.

These are still stylised cats. Close views retain visible contour facets and
smooth fur, especially on fluffy breeds. No photorealism, native-device FPS or
mobile GPU-memory improvement is claimed. Existing personal Miele markings and
white chest, breed differences and larger-headed kittens remain identifiable.
The Miele reference reviewed was `docs/miele-foto-ram.jpg`.

## Comparable views

The before gallery is [#1910 quarter](../1910/cats-quarter.png), unchanged in the
baseline commit. Final actual component views are [front](cats-front.png),
[side](cats-side.png), [quarter](cats-quarter.png), [CatSpawner poses](cat-spawner.png)
and [actual BestiaryImages at 96/320 px](cat-binder.png). The rows include sit,
walk, wash, pet, play, held and eating, using the actual pose methods.

Matched clean normal views: [before](https://raw.githubusercontent.com/solwation/lunden-3d-apartment/8e226fa183ade3ccc1bfb638427bc75e2120d7b6/docs/verification/1918/baseline-normal.png), [after](current-normal.png).
The camera uses 70° FOV at 1.62 m height, looking toward the cat at about 1.7 m;
these are component scenes with the same lighting, ground and inputs, not a full
World run. Each phase checks finite scene/camera matrices, the intended visible
cat in the frustum and successful production GLB installation.
Actual `catphoto.snapshot` images are [before](https://raw.githubusercontent.com/solwation/lunden-3d-apartment/8e226fa183ade3ccc1bfb638427bc75e2120d7b6/docs/verification/1918/baseline-photo.jpg) and
[after](current-photo.jpg); render-target/viewport state is restored.

## Cost and coverage

| Same scoped cat | Baseline | Current |
| --- | ---: | ---: |
| Submitted cat calls, open eyes | 24 | 22 |
| Submitted cat triangles, open eyes | 10,008 | 2,672 |
| Submitted cat calls/triangles, closed eyes | 22 / 8,968 | 20 / 2,512 |
| Unique retained attribute/index views, one fallback cat | 68,912 B | 75,728 B |
| Neutral GLB download | 45,880 B | 56,324 B |

The pre-change budget was <=24 calls and <=110% of submitted triangles and
single-cat geometry views, without new textures, lights or per-frame surface
construction. Geometry views increase 9.89%, within that budget. They include
hidden petting-hand/patch/X geometry and the existing tail, deduplicating shared
TypedArray views by identity. A naive sum per Geometry is 80,480 B because body
and colour surfaces share attributes/index. These are retained CPU geometry
views, not whole heap or GPU totals. Across all 37 forms, the finite coat cache
contains 24 colour arrays/33,696 B (30,888 B beyond the two arrays included in one
cat); positions/normals/UV/index remain shared. The GLB increases 22.76%, reported
separately rather than treated as a rendering or heap saving.

[Comparison samples](comparison.json) contain 10 warm-up plus 30 measured
render+`gl.finish` samples per phase at 640×480 in Playwright Chromium build 1248/SwiftShader.
Sub-millisecond results are near timer resolution and do not support a hardware
speedup claim; the actual submitted calls/triangles are the useful cost evidence.
[Buffer accounting](buffers.json), [consumer results](browser.json) and
[source hashes](source.json) distinguish the measured scopes. Gallery triangle
counters include the two-triangle ground; the table subtracts it. Calls subtract
the ground and grid. Raw traversal counts are not submitted render calls.

17 targeted Node checks pass, including all 37 real breed/coat/kitten forms ×
sit/stand × six gait phases, exact late-GLB posed vertices, finite geometry,
material/colour isolation, nose-surface contact without overlapping torsos,
real four-paw climb references, held/hug closure, CPU-attribute retention,
cache invalidation and continuous-surface spawn opacity. The actual component
browser covers 12 OutdoorCats with near puppets and two merged LODs each,
ten CatSpawner pose samples, ten BestiaryImages renders, missing-GLB fallback,
photo state and zero page errors. LOD baking preserves the new vertex colours;
its existing absence of personal texture sampling remains unchanged.

```sh
node --test tools/riggedcattest.mjs tools/riggedcatmigration.test.mjs tools/catnuzzletest.mjs tools/bestiarycatalogtest.mjs
PLAYWRIGHT_MODULE=/path/to/playwright tools/browsertest.sh node tools/capture-cat-quality.cjs http://127.0.0.1:8201/tools/riggedcatproduction.html docs/verification/1918
PLAYWRIGHT_MODULE=/path/to/playwright tools/browsertest.sh node tools/compare-cat-surfaces.cjs http://127.0.0.1:8201/tools/riggedcatproduction.html docs/verification/1918
```

After the final views, art/density inputs were moved unchanged into `CAT_SURFACE`.
[Identity proof](config-identity.json) covers all geometry buffers/colours, posed
world matrices, visibility and material colour/roughness for all 37 forms × two
poses before/after that move; the re-exported GLB is byte-identical.

Tail allocation, behavior/brain, spawn rules, distance cutoffs, saved photos and
collection IDs are unchanged. No full World/mobile timing run was needed for
these immutable surfaces; gameplay coverage is the existing real pose/contact
paths and the bounded actual consumers above. Public transfer is tracked separately in [public #268](https://github.com/solwation/kvarteret-lunden/issues/268),
priority low, for selective generic form/colour adaptation to its own anonymous
batched cats. No public code is delivered here; personal profiles/photos/names,
gameplay and services stay in the original project.

Integration review: [source preservation and inspected views](integration.json).
The final rebase adds only unrelated Hand configuration; cat inputs and model
buffers match the verified worker delivery. Changelog id is 1477.

Published at `8e226fa183ade3ccc1bfb638427bc75e2120d7b6`.
[Pages](https://github.com/solwation/lunden-3d-apartment/actions/runs/43187360876) and
[Worker](https://github.com/solwation/lunden-3d-apartment/actions/runs/43187360800)
passed for that revision. The pinned completion comment embeds the before/after
and actual consumer views; all eight image URLs returned HTTP 200/image types
before closure. This issue's two before screenshots are removed in the resolving
commit, while remaining accessible at the pinned evidence revision. Result images
follow 30-day retention. The resolving docs-only commit triggers no new deploy.
