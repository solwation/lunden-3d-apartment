# Shark surfaces — #1926

The actual landed shark, collection model and fin now share an authored shark
recipe: a tapered snout and underside mouth, five gill slits, swept pectorals,
an asymmetric tail and a smoother curved dorsal profile. The landed body still
lies on its side and **intentionally lacks its removed first dorsal fin**. Its
red cut remains; an intact GLB inspection variant is a separate alternative.
The established skeleton remains unchanged. These are stylised surfaces within
the existing fictional river-shark premise, not a new animal/gameplay system.

## Source, scope and images

Baseline `ad9eab1160e095847280a52c585d221a51b75cf1`. New art and density estimates
are in `SHARK.surface`; existing lengths, time windows, catch records and held
frames remain authoritative. No texture, light, per-frame geometry build or new
animation authority was added. The existing `Shark.update()` controls all phases.
The submerged dark shape shares the landed body's geometry, flattened in its
existing material/centre/heading frame rather than using an ellipsoid.

[Source manifest](source-manifest.json) binds final sources and the earlier main
and proxy capture sets. The main matrix was captured before the final proxy-only
addition and comment/export-boundary changes. [Exact identity proof](proxy-form-identity.json)
confirms identical body, intact, fin and skeleton buffers and both GLB files
across those changes. No main art/matrix rerun was needed. The six existing fish
recipes/packing were not changed; [fish GLB identity](unchanged-fish.json) confirms
the shark-only export leaves the separate resource untouched. The exporter
supports independent `--fish-only` and `--shark-only` boundaries.

| Matched view | Before | Result |
| --- | --- | --- |
| Actual landed body, oblique | [Before](before/body-quarter.png) | [After](body-quarter.png) |
| Landed side, rolled as in production | [Before](before/body-side.png) | [After](body-side.png) |
| Landed front | [Before](before/body-front.png) | [After](body-front.png) |
| Normal eye-height bank framing, 70° | [Before](before/body-normal.png) | [After](body-normal.png) |
| Actual normal river/fin phase, 70° | [Before](before/river-normal.png) | [After](river-normal.png) |
| Actual fin/wake close view | [Before](before/fin-close.png) | [After](fin-close.png) |
| Actual held fin | [Before](before/held.png) | [After](held.png) |
| Unchanged skeleton phase | [Before](before/bones.png) | [After](bones.png) |
| Actual binder at 96/320 px | [Before](before/binder.png) | [After](binder.png) |
| Separate intact inspection, lifted above plane | [Before](before/whole.png) | [After](whole.png) |

The implementer opened these result forms, both remote proxy sides and the
missing-asset fin. The integrator reviewed the initial proposals and final
landed/whole/normal-river/held/bones views. One bounded correction fixed inverted
winding on mirrored closed fin volumes and used the existing belly/fin palette
for their undersides; no detail loop followed. The first intact preview had a
bad plane intersection; the matched final intact view lifts both alternatives
above the plane. Landed views use the actual roll and contact-lift path on a
controlled flat bank plane, not an assertion about a full World terrain scene.
River views use the production opaque `bridges-water` mesh and an eye 1.62 m
above its water datum. The normal river silhouette improvement is modest at
that distance; the close view makes the curved fin and coherent dark shape clear.

## Three scoped checks

1. **Visible forms and consumers.** Actual `Shark`, `SharkFin`,
   `caughtFishGeometry('haj', SHARK.look)` and `BestiaryImages` are used. All main
   views and both binder sizes are nonempty. The shark's stable ID `fish:shark`
   and number 57 remain; only its thumbnail version becomes 2. The intact GLB
   has a dorsal, while the landed/binder body intentionally does not.
2. **Phases, contacts and intended pixels.** Full scene/camera/projection and
   geometry attributes are finite. A target-hidden frame proves intended visible
   pixels for each actual body/fin/bones/held view, including opaque river water
   (normal fin 655 pixels, baseline 613). Absence/far distance builds no shark
   meshes; hidden, near-hit/far-miss, body-only, skeleton-only and expiry gates
   pass. The landed minimum Y stays 0; placed fin minimum Y stays 0.001 m. Actual
   held position/quaternion/scale are exactly equal before/after. Missing GLB
   cases render the fin, body and bones. Seven existing schedule/arbitration
   tests and four focused GLB/consumer tests pass; no network/cooking/fishing
   implementation changed and no full peer/World suite is claimed.
3. **Bounded resources and actual submission.** Finite source geometry,
   outward closed fin volumes on both mirrored sides, source cache sharing,
   length/fin-height planes and locked raw/triangle budgets pass. Submitted calls
   are measured from the actual renderer, not inferred from object count. Thirty
   matched warm samples distinguish steady rendering from one-time construction.

[Final browser result](browser.json), [matched baseline](before/browser.json),
[surface checks](surface-tests.txt), [GLB checks](glb-tests.txt),
[schedule checks](schedule-tests.txt). Both full browser commands exited 0 with
no captured page/shader errors; the proxy command below also exited 0.

## Comparable costs

The old "four calls" comment counted four objects. The transparent DoubleSide
wake already submits **two** passes, so the actual swimming shark submits **five
passes**, plus the water: six calls in both phases. No single-pass switch was
introduced. Landed body and skeleton remain one call each; the held fin one.

| Quantity | Baseline | Result | Locked ceiling |
| --- | ---: | ---: | ---: |
| Landed/collection body triangles | 417 | 852 | 1,200 |
| Body raw position/normal/colour/index views | 11,394 B | 23,364 B | 28,485 B |
| World/held fin triangles | 34 | 66 | 80 |
| Each world/held fin raw views | 3,672 B | 1,836 B | 9,180 B |
| Skeleton triangles / raw views | 660 / 71,280 B | unchanged | unchanged |
| Runtime geometries + collection + one held fin, unique views | 95,178 B | 101,028 B | 237,945 B |
| Three ring instance matrices/colours | 228 B | 228 B | unchanged |
| Loaded GLB alternative geometry views | 97,572 B | 121,308 B | separate retained cost |
| All above unique views, including ring instance data | 192,978 B | 222,564 B | 481,875 B |
| Shark GLB file | 101,960 B | 125,736 B | separate transfer cost |
| Normal swim scene, water included | 6 calls / 1,372 tri | 6 / 2,156 | same calls |
| Landed scene, two-triangle plane included | 2 calls / 419 tri | 2 / 854 | same calls |
| Skeleton scene, plane included | 2 calls / 662 tri | unchanged | same calls |
| Held fin only | 1 call / 34 tri | 1 / 66 | same calls |

The shadow changes from 100 to 852 triangles while sharing the body's immutable
buffers; the fin adds 32 triangles. Together that adds 784 submitted triangles
in the same rare visible swim phase. The body stays 3.2 m nose-to-tail; the old
low-segment shadow ellipsoid approximated that nominal length. Its centre,
heading, phase and material remain. Fin height/bounds and held frame are exact.
The locked total ceiling used the stricter initial geometry-only baseline
192,750 B × 2.5; the later 228 B ring-instance accounting is shown explicitly.
The total includes loaded alternatives and runtime views, not simultaneous
submission of all GLB variants. GLB storage is not runtime draw count. These
are retained typed-array view bytes, not total JS heap, GPU memory, all underlying
GLB buffers, materials or temporary construction peaks.

[Loaded baseline](baseline-buffers.json), [delivered costs](final-buffers.json).
The unchanged three-ring matrix/colour storage is 192 + 36 B; its baseline field
is derived from the unchanged constructor and confirmed in the delivered consumer.

| Warm milliseconds, median / p95 | Baseline | Result |
| --- | ---: | ---: |
| Swim production update | 0.0 / 0.1 | 0.0 / 0.1 |
| Swim render + `gl.finish()` | 0.2 / 0.5 | 0.2 / 0.4 |
| Landed production update | 0.0 / 0.1 | 0.0 / 0.0 |
| Landed render + `gl.finish()` | 0.1 / 0.1 | 0.1 / 0.2 |

Same controlled Chromium/SwiftShader path, DPR 1, 640 × 480, eight warmups then
30 samples; same seed, clock increments, scene, camera and opaque water. Zeroes
mean below the roughly 0.1 ms timer resolution, not free work. One Node build
observation was 12.9 ms before / 13.0 ms after; it is not a browser startup or
repeatable speed comparison. Shared-host noise and software rendering limit these
small timings. No native/phone FPS, total-memory or startup-speed gain is claimed.

## Remote fin proxy

The existing `hi=sharkfin` category now uses the same cheap fin profile with a
red cut cap instead of a cone/red box. No protocol/species data or other item
recipe changed. The generic fish proxy belongs to #1922 and is not changed here.
`SHARK.surface.ghost` records the exact legacy Float32 envelope:
min `[-0.025980761274695396, 0.007499999832361937, -0.2449999898672104]`,
max `[0.025980761274695396, 0.44999998807907104, 0.08499999344348907]`.
The hand/world transforms, orientation and identity mesh scale stay exact.

| Remote fin | Before | Result | Ceiling |
| --- | ---: | ---: | ---: |
| Calls / triangles | 1 / 18 | 1 / 66 | 1 / 80 |
| One lazy shared cache | 1,944 B | 1,836 B | 8,192 B |

This cache is separate from the table above. Including it gives 194,922 →
224,400 B retained view storage. Actual Ghost at 2.5 m / 70° FOV proves 1,353
intended fin pixels (1,365 before), finite scene/camera matrices, one proxy call,
shared cache/material, exact bounds/hand transform, weapon priority, far hiding,
empty and unknown-category contracts. The main form/GLB identity proof above
allows reusing its passing matrix rather than recapturing it for this addition.
The old broad `ghostitemtest.cjs` is not claimed green: its pre-existing 17/18
category-list/index bug is independently tracked as #1937 and is not fixed here.

| Remote diagnostic | Before | Result |
| --- | --- | --- |
| Representative whole Ghost, normal distance | [Before](before/ghost-shark-normal.png) | [After](ghost-shark-normal.png) |
| Close diagnostic, cropped at edges | [Before](before/ghost-shark-close.png) | [After](ghost-shark-close.png) |
| Reverse close diagnostic | [Before](before/ghost-shark-reverse.png) | [After](ghost-shark-reverse.png) |

[Proxy data and source binding](ghost-shark.json). Close pictures are diagnostics;
the complete normal Ghost view is the representative result. The source check
also confirms finite proxy attributes, correct index-based triangle count,
shared cache, exact envelope and red cut-cap colour. The implementer opened
both sides and normal proxy images; the integrator opened and accepted the whole normal proxy view before handoff.

## Reproduction and scope boundary

With the owned checkout served at 8201:

```sh
node tools/buildfishglb.mjs --shark-only
node tools/sharksurfacetest.mjs
node --test --test-name-pattern='shark' tools/fishglbtest.mjs
node --test cloudflare/shark.test.mjs
node tools/measure-shark-geometry.mjs
PLAYWRIGHT_MODULE=/path/to/playwright BROWSERTEST_TIMEOUT=2m tools/browsertest.sh node tools/capture-shark-quality.cjs /tmp/shark-result
SHARK_BASELINE=ad9eab1160e095847280a52c585d221a51b75cf1 PLAYWRIGHT_MODULE=/path/to/playwright BROWSERTEST_TIMEOUT=2m tools/browsertest.sh node tools/capture-shark-quality.cjs /tmp/shark-before
PLAYWRIGHT_MODULE=/path/to/playwright BROWSERTEST_TIMEOUT=2m tools/browsertest.sh node tools/capture-ghost-shark-quality.cjs /tmp/shark-proxy
```

`SHARK_ORIGIN` selects another owned main-fixture server; the reused proxy
harness accepts `FISH_ORIGIN`. Browser jobs use the shared lock. The proxy capture
emits `ghost-shark-before-` files; saved before copies are under `before/` for
pruning after pinned publication. Result images have the normal 30-day lifetime;
source/hash/JSON records remain. Root alone integrates, publishes actual deploy
checks and embeds pinned result images before closing.

This shark is original-only capture/gameplay content. No public ambient-fish
transfer applies. No broader gameplay, animal, network or performance work is
included.


Root reviewed the combined product/fixture/export diff and opened final body, whole, river, held, bones, binder and normal Ghost before/after. Rebase keeps the measured SHARK recipe and shark/fixture/GLB files exactly; current six-species, packed and neutral buffers and fish GLB remain [byte-identical](integrated-fish-hashes.json). [Integration mapping](integration.json) binds the selective shark branches, preserved current fish exporter/proxy and changelog1485. Scoped native shark/proxy and generic-fish checks pass on this combined source; existing actual browser evidence is reused through these identities.
