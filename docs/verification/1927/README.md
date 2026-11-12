# Pingping, a sewn cushion — #1927

Baseline `ac2fd0ea484bf7e905fb92d6bb9bb6ae40f005f3`. Original-only personal
furnishing/character; no public downstream transfer. The retained product photo
`docs/pingping-pingvinkudde.jpg` was opened before implementation. This follows a
soft navy cushion with sewn pale panels, its existing expression, flippers and
feet; it does not replace it with a live penguin or embed the personal photo.

## Result and locked scope

`PINGPING.surface` contains the new visual/density guesses before final export and
captures. `pingpingsurface.js` shares the authored geometry/material recipe between
the runtime and GLB. One shared 256px normal map suggests short pile. The existing
512px face resource gains restrained seam/thread edges and colour grain. Small
static panel joins and low stuffing gathers keep the original size/contact anchors;
the established hug scale still performs the actual compression. No extra surface
layer/pass, fur mesh, cloth simulation, light or per-frame geometry/cache is added.

The integration owner opened before/after whole and actual normal bed views and
approved this bounded surface step. Form/materials were then locked, with no extra
detail pass. Front/side captures were subsequently corrected only to remove the
occluding bed from those diagnostic product views. The representative normal image
continues to show the genuine bed()/Pingping consumer and its support. The factory,
controller and actual Hand are used, not a replacement gallery model.

Saved and opened views:

- `whole.png`: actual cushion between the real bed pillows, at a close oblique view.
- `normal.png`: the same real bed at ordinary standing distance; representative view.
- `front.png`, `side.png`: complete product silhouette, with bed hidden solely to
  expose the lower panels/feet; not evidence of placement/support.
- `held.png`, `hug.png`: unchanged actual first-person view, whose bottom crop already
  existed before this work. This camera submits three cushion meshes, not four.
- `held-contact.png`, `hug-contact.png`: external inspection of the actual camera-held
  model and both production Hand poses, showing the complete cushion and compression.
- `collection.png`: the actual collection recipe in the controlled scene.
- `thumbnail-loaded.png`, `thumbnail-missing.png`, `thumbnail-late.png`: actual
  BestiaryImages 320px output through its persisted cache, not substituted screenshots.
- Matching source-frozen views are in `before/`.

## Three scoped checks

1. **Visible product/contacts:** matched whole/front/side/normal/held/hug/collection
   cameras, lights, scale and poses. The before/after model, camera and grip matrices
   are byte-exact across all nine rows. Current normal view contributes 5,260 intended
   cushion pixels. Complete silhouette/contact and actual normal support were opened.
2. **Actual consumers and cache:** full finite native attributes/model/hand/camera,
   inverse and projection matrices and paired hidden-model pixel proofs. Loaded,
   missing-404 and delayed GLB paths pass. A late GLB retains the already-live fallback
   geometry; a subsequently created loaded model has identical positions/UVs/indices.
   Existing take/place/return, squash, hearts, grips and facing run through production
   Pingping/Hand. Geometry does not rebuild/drift after 120 updates. Pingping alone
   changes modelVersion from 1 to 2. A real obsolete IndexedDB v1 thumbnail is retained
   but missed; v2 renders/stores exactly once and a fresh image provider hits that
   persisted result. Discovery metadata and a separate photo survive unchanged.
   Collection disposal does not dispose the two shared maps. Off-camera cushion
   contributes zero model calls. Controller/Hearts source below the factory is exact.
3. **Bounded costs:** actual submitted counters, unique typed-array and image sources,
   native geometry/asset bytes and a fixed warm component interval. Seven figure
   tests pass, including exact position/UV/index export/fallback parity. GLTFExporter
   normalises Float32 normals by <1e-7; its replacement normal at four unused sphere
   pole vertices is permitted only after proving those vertices are absent from the
   indices. This initial strict-normal comparison was corrected as an evidence issue,
   without changing the locked product. Santa's asset remains byte-identical.

## Budget and measured costs

The actual initial baseline was measured before surface work: loaded four meshes,
4,168 triangles /147,888B; fallback four meshes, 6,032 triangles /145,184B; GLB152,308B.
The locked ceiling was ≤4 model passes, ≤1.2× native triangle/geometry bytes for each
path, and at most two added shared 256px RGBA maps. The chosen step uses one new map,
with no geometry increase in the loaded path. The fallback now uses the same tessellation.

| Quantity | Before | Final |
| --- | ---: | ---: |
| Full visible model calls / submitted triangles | 4 /4,168 | 4 /4,168 |
| Existing held/hug camera calls / submitted triangles | 3 /3,832 | 3 /3,832 |
| Loaded live native geometry | 147,888B | 147,888B |
| Missing/early live native geometry / triangles | 145,184B /6,032 | 147,888B /4,168 |
| Loaded source geometry cache | 147,888B | 147,888B |
| Live loaded + source native geometry | 295,776B | 295,776B |
| Additional transient collection geometry | 147,888B | 147,888B |
| Existing face atlas, raw512px RGBA per generated instance before | 1,048,576B | shared1,048,576B |
| New shared normal map, raw256px RGBA | 0 | 262,144B |
| Shared final image cache across source/live/collection | — | 1,310,720B /2 images |
| GLB file transfer | 152,308B | 519,856B |

The GLB now embeds the intended face and normal maps instead of its former white
face placeholder; PNG payloads are 204,160B and 162,740B. This is a real 367,548B
increase in file transfer, not a loading-time or memory improvement. Download size,
unique native typed-array/image-source bytes and total browser/GPU memory are different
quantities; the latter was not measured. Texture mipmaps/driver allocation are not
included in raw RGBA figures. No new downloaded external asset is used.

`consumers.json` deliberately also holds one independent "next loaded model" probe.
Its loaded/late sums are 591,552B (four models including source, collection and probe),
and its missing sum443,664B (three models including collection/probe). Subtract the
147,888B probe to obtain443,664B loaded/late with a collection open or295,776B missing
with a collection open. The production live-plus-source row above excludes both
collection and probe; no transient test model is disguised as a runtime cache.
The existing Hearts/pick/Hand/bed resources and gameplay remain unchanged; the
table covers affected cushion surface/cache buffers, not the whole apartment.

Warm interval: same actual normal bed consumer,1200×760 DPR1, fixed lights/calendar,
8 warm frames then25 sync render/update samples with gl.finish. Before median/p95
0.2/0.3ms; final0.2/0.3ms (timer-quantised). These Chromium156.0.8078.4 / ANGLE
SwiftShader component samples include the unchanged bed. They establish no native
GPU/phone FPS, reliable speed-up, startup time or whole-World performance claim.
No physical device or enforceable cgroup memory ceiling was tested.

## Source binding and reproduction

`before.json` and `after.json`: exact source hashes, nine consumer poses/cameras,
real submitted costs, buffers/images, intended pixels and warm intervals.
`consumers.json`: final source hashes and loaded/missing/late/cache/dispose proofs.
`native-costs.json`: source-bound original/final native sizes, embedded PNG bytes,
unchanged controller/Hearts and Santa-asset proof. `figure-tests.txt`: seven tests.

```sh
node --test tools/figuresglbtest.mjs
tools/browsertest.sh node tools/buildpingpingglb.cjs http://localhost:8203
tools/browsertest.sh node tools/pingpingrealismtest.cjs http://localhost:8203 docs/verification/1927 before
tools/browsertest.sh node tools/pingpingrealismtest.cjs http://localhost:8203 docs/verification/1927 after
tools/browsertest.sh node tools/pingpingconsumerstest.cjs http://localhost:8203 docs/verification/1927
```

The server must serve this checkout, using the installed local Three0.170 and
Playwright cache and documented PLAYWRIGHT_MODULE/CHROME_PATH. All browser jobs
used the shared wrapper/lock. `tools/buildfiguresglb.mjs --santa-only` still updates
only Santa; Pingping requires browser canvas via its explicit exporter above, so a
Node-only default export refuses to silently overwrite its textured asset.

Initial harness diagnostics exposed a missing final render after hidden-object
comparison (bad non-timing screenshots) and a favicon404. They were corrected;
the source-frozen baseline and corresponding final captures above supersede those
files. No product/shape change was made for these capture corrections. After the
bounded form review, only targeted consumer/cache/native and unobscured-view checks
continued; no broad apartment/performance/headshot or gameplay-network chain ran.

Root owns integration, provisional changelog renumbering, actual Pages/Worker
publication and pinned HTTP200 image comment before resolving/closing. Before-images
are removed only in that resolving commit after publication; result images follow
the usual30-day retention. This worker supplies a local Refs handoff only.

Root reviewed the combined production/exporter/fixture/evidence diff and opened matched whole/normal bed views, free front/side diagnostics, hug contacts and late-load thumbnail. [Integration mapping](integration.json) proves every executed model/tool/asset and image exact, plus full PINGPING configuration and collection case. Current Santa portrait, butterfly and shark/fish sources are preserved. Changelog is1487 after latest main fetch; scoped green checks are reused without broad repetition. Initial integration probes stopped before publication on an indentation assumption and two incorrect file names; corrected source mapping passes without a product change.
