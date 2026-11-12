# Six fish species — #1922

The six existing species now have separate live and caught silhouettes. Pike have
an elongated flat head and rear fins, bream a deep compressed body, and eel a
slender continuous fin/tail and blunt head. Smaller eyes sit on the skin; caught
fish have rounded sections and cambered fins. These are stylised project-authored
surfaces, not photographic fish. No new textures, lights or per-frame geometry
builds were introduced. Shark is unchanged and remains a separate recipe/asset.

## Source and comparison

Baseline: `c1aa51549079192cc39de8b74cc3f9d3a5603ef8`. The same final fixture,
lighting, camera, sizes and view layout were used for both phases. Baseline routes
serve its original config, riverfish, riverfishmodel, caughtfish and fish GLB from
Git. Other unchanged production dependencies are shared. This is a controlled
consumer fixture, not a claim that the whole World was benchmarked.

[Source manifest](source-manifest.json) records delivered app/fixture SHA-256s
and the earlier capture-source set.
[Measured hashes](measured-hashes.json) map the captured art sources to
[delivered hashes](delivered-hashes.json). After the captures, remaining art
constants were moved into `FISH_SURFACE` (inherited #1765 values are labelled),
and the stale caught-triangle comment was corrected. All six live source
geometries, all six caught geometries, the complete packed attribute/index
layout, neutral geometry and GLB are **byte-identical** across that change.
Config, fishsurface and caughtfish source hashes therefore change explicitly;
riverfish, riverfishmodel and GLB hashes stay equal. Captures and timings apply
to these unchanged surfaces without repeating the browser matrix.

Reviewed comparisons:

| View | Baseline | Result |
| --- | --- | --- |
| Live species, same nominal dimensions | [Before](before/live.png) | [After](live.png) |
| Ordinary live framing | [Before](before/live-normal.png) | [After](live-normal.png) |
| Caught, equal 40 cm comparison length | [Before](before/caught.png) | [After](caught.png) |
| Actual held pike | [Before](before/held-3.png) | [After](held-3.png) |
| Cooked colours | [Before](before/cooked.png) | [After](cooked.png) |
| Actual binder renderer | [Before](before/binder.png) | [After](binder.png) |
| Natural pike through opaque river water | [Before](before/natural-gädda-up.png) | [After](natural-gädda-up.png) |
| Natural eel through opaque river water | [Before](before/natural-ål-up.png) | [After](natural-ål-up.png) |

Caught/cooked galleries: upper row pike, trout, eel; lower row roach, perch, bream.
The equal length makes shape comparison readable; actual live lengths, heights
and widths still come from the existing species records. `held-0.png` through
`held-5.png` show roach, perch, bream, pike, trout and eel with the actual camera
parent, hand pose and 40 cm length. Both sides of live fish are shown by
[live](live.png) and [reverse side](live-down.png). The
[surface contact](surface.png) and [missing-asset fallback](fallback-live.png)
were also opened and inspected. All six held models were visually reviewed;
normal, cooked, binder and representative natural-water images were reviewed by
the implementer and the independent integrator before handoff.

## Three verification groups

1. **Form and real consumers.** Actual `RiverFish`, `CaughtFish` and
   `BestiaryImages` are instantiated. Six species render live, raw, cooked and
   held; the binder produces twelve nonempty images (96 and 320 px for all six).
   Only the six fish thumbnail model versions become 2; IDs 51–56, discoveries
   and saved photos remain stable. Shared world drops already carry the species
   and use the same caught factory. The remote held proxy remains a generic category because protocol `hi=fish`
   carries no species; its geometry is improved by the bounded addendum below.
   No protocol change is introduced.
2. **Rendering, anchors and behaviour boundaries.** All object/camera matrices
   and populated instance data are finite. Twelve valid natural states cover
   each species near the top and bottom of the existing rise cycle using the
   actual opaque `bridges-water` mesh, bank camera at 1.62 m and 70° FOV. Each
   intended fish is isolated against a water-only frame to verify actual pixels,
   not merely a positive draw count (minimum 136 changed pixels; baseline 142;
   threshold 12). Natural positions/rise records and six held pose/length records
   are identical between phases. All six surface models rest at min Y = 0.001 m
   through production `restPose`. Caught-life exclusion, hidden/far gating and
   all-six-species 404 fallback pass. No fishing, cooking, network or task logic
   was rewritten. Full gameplay/network integration is outside this fixture.
3. **GPU layout and bounded cost.** Actual shader compilation and rendering pass
   for six species in the same material/batch: 14 active attribute slots,
   `MAX_VERTEX_ATTRIBS = 16`, highest assigned location 15. Packed position error
   is at most 0.000012785 normalized units; minimum decoded normal dot product is
   0.999881. Geometry tests cover finite surfaces, colours, cache sharing,
   length/nose bounds, species profile ordering, packed targets and budgets.
   Three focused GLB tests cover header, neutral/static and five-bone binding,
   clips and animated bounds. Shark tests/assets are unaffected.

[Browser result](browser.json), [baseline browser result](before/browser.json),
[geometry checks](geometry-tests.txt), [focused GLB checks](glb-tests.txt).
The final full browser command exited 0 with no page/shader errors. The baseline
full matrix wrote its complete passing JSON and printed PASS, but its wrapper
then exited 143 during/after browser cleanup; the cause was not established.
A bounded baseline open/render/close check subsequently exited 0 and validated
the saved matrix assertions. The first wrapper is not reported as a green exit;
its complete saved measurements are retained with this limitation.

## Geometry, submission and asset costs

The live fish remain **one object/batch and one material, with two transparent
DoubleSide render passes**, exactly as before. The original one-batch description
must not be read as one submitted draw call. No `forceSinglePass` change was made.
The separate ring batch, opacity, murk, rise, distance and culling rules remain.

| Comparable retained/submitted quantity | Baseline | Result | Local ceiling |
| --- | ---: | ---: | ---: |
| Live triangles per filled fish | 433 | 411 | 900 |
| Submitted fish calls | 2 | 2 | 2, preserved |
| Submitted triangles per filled fish | 866 | 822 | — |
| Filled 18-fish batch triangles, both passes | 15,588 | 14,796 | — |
| Loaded live geometry attribute/index views | 17,538 B | 18,027 B | — |
| 18-instance attributes/matrices | 1,368 B | 1,512 B | — |
| Loaded live geometry + instance views | 18,906 B | 19,539 B | 25,860 B |
| Six caught geometry caches | 82,212 B | 135,540 B | 164,424 B |
| Loaded neutral GLB geometry views | 35,076 B | 37,692 B | Separate retained cost |
| All unique live + instances + caught + neutral views | 136,194 B | 187,029 B | Reported absolute |
| GLB transfer file | 41,944 B | 44,576 B | Separate transfer cost |

The conservative live ceiling was fixed before editing at twice the old
**fallback** geometry + instances (11,562 + 1,368 = 12,930 B). The loaded baseline
also retained unused skin attributes, hence its higher 18,906 B. Do not substitute
one baseline for the other. Result live position/index attributes share 5,742 B
with the matching loaded neutral resource; the full unique total deduplicates
those exact views. Missing/old assets retain the complete six-species source
path. The loaded neutral resource contains two geometries. These are unique
retained typed-array view bytes, not total heap, GPU memory, all GLB underlying
buffers, materials or temporary construction peaks.

| Caught species | Triangles before → after | Raw view bytes before → after |
| --- | ---: | ---: |
| Roach / mört | 433 → 743 | 11,562 → 20,550 |
| Perch / abborre | 499 → 743 | 13,542 → 20,550 |
| Bream / braxen | 409 → 743 | 10,986 → 20,550 |
| Pike / gädda | 537 → 847 | 16,866 → 25,854 |
| Trout / öring | 547 → 879 | 18,078 → 27,486 |
| Eel / ål | 417 → 743 | 11,178 → 20,550 |

Each caught model remains one draw, one shared cached geometry per species and
below 900 triangles; all six raw costs are individually below twice baseline.
Live source profiles are temporary construction inputs and are dropped after
packing. The neutral GLB's five bones and `swim`/`idle` clips support inspection
and export verification; actual live instances use packed targets and one
bounded shader phase from the existing river clock, **not eighteen skinned
models or animation mixers**.

[Loaded baseline costs](baseline-loaded-buffers.json),
[captured candidate costs](measured-buffers.json),
[delivered costs](final-buffers.json).

## Bounded timing observations

Same Chromium/SwiftShader path, DPR 1, 640 × 480, eight warmup iterations followed
by thirty measured samples. `render + gl.finish()` includes driver/software work.
Natural production update has 18 configured slots and **five filled fish** in
both phases; the separate capacity case explicitly fills all 18 for submission
comparison. It is not presented as a naturally clustered population.

| Milliseconds: median / p95 | Baseline | Result |
| --- | ---: | ---: |
| Natural production update | 0.2 / 0.5 | 0.1 / 0.2 |
| Natural render + finish | 0.4 / 2.4 | 0.3 / 0.4 |
| Full 18-fish diagnostic render + finish | 0.3 / 9.6 | 0.2 / 0.3 |

Natural scene submission is four calls / 5,836 → 5,616 triangles (fish two passes,
opaque river and unchanged rings); capacity scene is three calls / 15,590 →
14,798 triangles (fish two passes plus two-triangle ground). Camera and scene are
matched. One browser constructor observation **after GLB load** rose from 3.6 ms
to 21.7 ms while building/packing six temporary profiles; this is startup work,
not a warm-frame cost. Node construction samples are separate and not compared
to browser times. Shared-host load, roughly 0.1 ms timer granularity and software
rendering limit these small values. No native-device FPS, load-time gain or
statistically established frame-time improvement is claimed. Extra retained
storage and startup work finance the species shapes; steady-state batch count
and geometry remain bounded.

## Reproduction and transfer boundary

Serve the checkout on 8201, then from its root:

```sh
node tools/buildfishglb.mjs --fish-only
node tools/caughtfishtest.mjs
node --test --test-name-pattern='fish-generic|normalized instanced fish' tools/fishglbtest.mjs
node tools/measure-fish-geometry.mjs
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright BROWSERTEST_TIMEOUT=4m tools/browsertest.sh node tools/capture-fish-quality.cjs /tmp/fish-result
FISH_BASELINE=c1aa51549079192cc39de8b74cc3f9d3a5603ef8 PLAYWRIGHT_MODULE=/path/to/node_modules/playwright BROWSERTEST_TIMEOUT=4m tools/browsertest.sh node tools/capture-fish-quality.cjs /tmp/fish-before
```

`FISH_ORIGIN` can select a different owned server. Browser jobs use the shared
lock. The integrator publishes and embeds reviewed images before issue closure;
result images retain the standard 30-day lifetime, while before images can be
pruned after their pinned publication. JSON/hash records remain.

A separate public low-priority port should adapt these generic live species
surfaces to that project's own factory, batching and LOD. Do not copy original
caught/hand/binder/cooking/gameplay, personal content, or service integrations.


## Remote hand fish addendum

The initial scope judgement left the visible remote held-category fish unchanged.
The integrator corrected that judgement under #1922: it now uses one low-density
neutral fish from the shared recipe, replacing the sphere/cone silhouette. It
still represents only the generic category `hi=fish`; it does not pretend that
species data exists. No protocol, pose or other item recipe changes are included.

Baseline for this addendum is `4708328d6f86934f35f9457618ca2dc5d194804b`.
`FISH_SURFACE.ghost` holds the guessed density and exact old Float32 envelope;
the default six-species paths are byte-identical before/after the optional density
parameter, including all live/caught/packed/neutral buffers and the GLB. Compare
[the prior delivered hashes](delivered-hashes.json) with
[the addendum hashes](proxy-default-hashes.json). The source manifest retains the
original captured SHA set separately and identifies the final app/test sources.
[Proxy browser data](ghost-fish.json) also binds the actual addendum sources.

| Proxy quantity | Before | After | Locked ceiling |
| --- | ---: | ---: | ---: |
| Submitted calls | 1 | 1 | 1 |
| Triangles | 42 | 161 | 180 |
| Cached position/normal/colour/index views | 4,536 B | 5,754 B | 16,384 B |

This one additional lazy cache is separate from the full live/caught/neutral
cost table above. Mesh transforms and exact local bounds remain:
min `[-0.030000001192092896, -0.27000001072883606, -0.12763139605522156]`,
max `[0.030000001192092896, -0.014999999664723873, -0.032368600368499756]`.
The nose points down (-Y); the existing Ghost right-hand origin and pose are
unchanged. Repeated instances share the same indexed geometry and material.

| Reviewed proxy view | Before | After |
| --- | --- | --- |
| Representative actual Ghost, 2.5 m / 70° FOV | [Before](before/ghost-fish-normal.png) | [After](ghost-fish-normal.png) |
| Isolated diagnostic close view | [Before](before/ghost-fish-close.png) | [After](ghost-fish-close.png) |
| Reverse diagnostic close view, cropped at top | [Before](before/ghost-fish-reverse.png) | [After](ghost-fish-reverse.png) |

The matched actual-Ghost path verifies exact hand/world transforms and bounds,
finite full scene/camera matrices, one proxy draw, shared cache/material, and
weapon priority, far hiding, empty and unknown-category contracts. The normal
view has 669 intended fish pixels (828 before) against a fish-hidden frame.
The diagnostic close pictures illustrate the low-detail shape; the complete
normal view is the representative remote-hand result. The implementer and
integrator opened and accepted these images. No further art pass was made.

The proxy-only capture exited 0. [Geometry checks](ghost-fish-geometry-tests.txt)
add finite attributes, exact envelope/nose direction, triangle/index counting,
100-instance cache sharing and the bounded raw budget. Reproduce with:

```sh
node tools/ghostfishgeometrytest.mjs
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright BROWSERTEST_TIMEOUT=2m tools/browsertest.sh node tools/capture-ghost-fish-quality.cjs /tmp/ghost-fish
```

The capture emits before images with a `ghost-fish-before-` prefix; the saved
copies here live under `before/` so the integrator can prune them after pinned
publication. The six-species matrix is reused through the exact default-buffer
identity proof rather than rerun for this independent bounded proxy.

## Root integration review

Root reviewed the combined production/fixture/export diff and opened the matched
whole live/caught/held/cooked/binder/normal/water views and generic proxy before/after.
Only the generic hi=fish proxy remains category-level; it now uses the cheap shared
shape without new protocol fields. All six live/caught surfaces and the neutral GLB
remain byte-identical across its optional-density extension. Rebase preserves all
six fish/proxy-related config sections and every measured model/fixture/export file;
[delivered hashes and mapping](integration.json) bind the measurements.
The old ghostitemtest category-index failure is separately tracked in
[#1937](https://github.com/solwation/lunden-3d-apartment/issues/1937); only its intentional
fish triangle ceiling changed here, and the new actual-Ghost checks provide scoped
passing evidence. Changelog id1482 assigned after final main fetch.
