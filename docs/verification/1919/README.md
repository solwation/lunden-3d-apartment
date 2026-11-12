# Softer pony anatomy and surfaces — #1919

Baseline: `9254ea2e3026015d0e71454e70433db22737b679`.
Reference reviewed: [existing Zoey/Princess photo](../../ingame-reports/b6346949-f99d-4eb9-af70-4603dae2dceb-2.jpg).

The pony loft now uses rounded interpolated sections and smooth authored normals,
including across UV palette boundaries. The neck starts inside the shoulder;
the head has a tapered bridge and rounded muzzle, small flush eye/nostril lenses,
leaf-shaped ears and a smaller star on Princess's actual forehead surface. A few
separate tapered locks replace the solid mane/forelock/tail silhouette. New art
profiles and tessellation are in `PONY_SURFACE`, labelled authored estimates.

These remain stylised horses: close views retain simplified hair, some contour
facets and visible part transitions during deep grazing. This is a visible
anatomy and surface improvement, not a photorealism or hardware frame-rate claim.
The existing withers class, torso/rug frame, 22-bone rig, weights algorithm,
clips, runtime pose authority, picks, behavior and feeding/network paths remain.
No new texture, light or per-frame geometry construction was introduced.

## Comparable actual consumers

The captured scene is the real `Paddock` on controlled flat ground with its
existing grass, fence, materials, poses and two actual individuals. It is not a
full World run. The same camera/light inputs and ACES mapping are used per view,
1500×800/DPR1. Normal/pet-distance cameras use 70° FOV at 1.62 m eye height; whole
views use 44°. The before phase loads baseline `paddock.js`, `config.js` and GLB
from Git; after uses the candidate source. Grass uses the exact same 8508 instance
matrices, count, grazing mask and grass-length values copied from the before
phase. Seeding alone would be insufficient because Three UUID creation also
consumes random values.

| View | Before | After |
| --- | --- | --- |
| Whole quarter | [baseline](https://raw.githubusercontent.com/solwation/lunden-3d-apartment/5d19eaeeaebb31109f5b0167c2b4786b24c04176/docs/verification/1919/baseline-quarter.png) | [current](current-quarter.png) |
| Front/identity | [baseline](https://raw.githubusercontent.com/solwation/lunden-3d-apartment/5d19eaeeaebb31109f5b0167c2b4786b24c04176/docs/verification/1919/baseline-front.png) | [current](current-front.png) |
| Whole side | [baseline](https://raw.githubusercontent.com/solwation/lunden-3d-apartment/5d19eaeeaebb31109f5b0167c2b4786b24c04176/docs/verification/1919/baseline-side.png) | [current](current-side.png) |
| Normal eye height | [baseline](https://raw.githubusercontent.com/solwation/lunden-3d-apartment/5d19eaeeaebb31109f5b0167c2b4786b24c04176/docs/verification/1919/baseline-normal.png) | [current](current-normal.png) |
| Pet distance | [baseline](https://raw.githubusercontent.com/solwation/lunden-3d-apartment/5d19eaeeaebb31109f5b0167c2b4786b24c04176/docs/verification/1919/baseline-pet-close.png) | [current](current-pet-close.png) |
| Grazing | [baseline](https://raw.githubusercontent.com/solwation/lunden-3d-apartment/5d19eaeeaebb31109f5b0167c2b4786b24c04176/docs/verification/1919/baseline-graze.png) | [current](current-graze.png) |
| Walk | [baseline](https://raw.githubusercontent.com/solwation/lunden-3d-apartment/5d19eaeeaebb31109f5b0167c2b4786b24c04176/docs/verification/1919/baseline-walk.png) | [current](current-walk.png) |
| Pet pose | [baseline](https://raw.githubusercontent.com/solwation/lunden-3d-apartment/5d19eaeeaebb31109f5b0167c2b4786b24c04176/docs/verification/1919/baseline-pet.png) | [current](current-pet.png) |
| Winter rugs | [baseline](https://raw.githubusercontent.com/solwation/lunden-3d-apartment/5d19eaeeaebb31109f5b0167c2b4786b24c04176/docs/verification/1919/baseline-winter.png) | [current](current-winter.png) |
| Actual BestiaryImages 96/320 | [baseline](https://raw.githubusercontent.com/solwation/lunden-3d-apartment/5d19eaeeaebb31109f5b0167c2b4786b24c04176/docs/verification/1919/baseline-binder.png) | [current](current-binder.png) |

All final images were opened and reviewed. The smaller eyes and curved muzzle
show clearly at pet distance, the forehead star remains visible beneath the
forelock, the neck cap is buried in the shoulder and both winter rugs keep their
open-neck fit. Both coats/points stay distinct. The unchanged-body/leg joins
still have a deliberately simple shape. Generated pony thumbnails use version 2
(previous default 1); discovery IDs and saved meeting photos are unchanged.

## Scoped cost

| Scope | Baseline | Current | Locked limit |
| --- | ---: | ---: | ---: |
| Submitted calls per pony | 1 | 1 | 1 |
| Submitted triangles per pony | 1,080 | 2,652 | 3,000 |
| Shared indexed rigged geometry, both ponies | 52,856 B | 120,632 B | 158,568 B |
| Retained shared fallback geometry | 168,480 B | 413,712 B | 505,440 B |
| Unique geometry views for both plus retained fallback | 221,336 B | 534,344 B | ≤3× baseline |
| Neutral GLB download | 72,300 B | 140,088 B | reported separately |
| Actual field calls/triangles, summer | 5 / 44,524 | 5 / 47,668 | same field inputs |
| Actual field calls/triangles, winter | 6 / 44,664 | 6 / 47,808 | same rugs |

The indexed geometry is shared between both SkeletonUtils consumers, so its
bytes are not doubled. The visible-art gain finances 2.28× indexed and 2.46×
fallback geometry within the pre-change 3× budget. Total retained geometry views
increase 2.41×; the two existing 512×512 canvas atlases, bones/object heap,
renderer allocations and GPU totals are outside this byte accounting.
Fallback instance attributes add 120 B and its two instance matrices 128 B in
both versions. The neutral GLB increases 93.76%; it contains no personal image.
[Exact geometry/index accounting](buffers.json), [source hashes](source.json).

[Matched browser results](browser.json) record two actual submitted pony draws,
finite scene/camera matrices, both intended visible loaded ponies intersecting
the frustum in every view, shared geometry and no page errors. Triangle counts
for the ponies are measured by rendering the actual meshes in the same scene
with other meshes hidden, then restoring them for the picture. The field-only
triangle contribution is identical before/after.

At 640×480/DPR1, after 10 warm-up samples, 30 matched samples include real
`Paddock.write(1/60)`, field rendering and `gl.finish`. CPU update median/p95 is
0.0/0.1 ms both phases; the combined interval is 0.2/0.3 ms before and 0.2/0.4 ms
after. These SwiftShader command/update measurements are near timer resolution,
not a physical GPU/phone frame budget. They support no FPS or speedup claim;
actual submitted triangle growth is stated above.

## Focused regression checks

[24 targeted Node checks](node-tests.txt) pass: neutral skinning, complete 22-bone
hierarchy/five clips, all clip samples with finite actual deformed vertices,
hoof/body bounds and grazing reach, pick/surface behavior and winter rug setup.
The new rug-fit check casts from 210 actual upper torso vertices into the actual
unchanged cover: every sample retains positive clearance (18.96–72.36 mm in the
measured candidate). This checks the affected upper flanks/back, not the open
neck or deliberately uncovered belly/legs.

Both actual Bestiary entries render at 96 and 320 pixels (four renders per phase;
zero is rejected). [Actual 404 fallback](current-fallback.png) and
[fallback counters](fallback.json) keep two finite shader-animated instances,
one draw/5,304 triangles for both, when the GLB is unavailable. This is the
retained fallback recipe, not a foreign replacement model.

```sh
node --test tools/riggedponytest.mjs tools/ponyblankettest.mjs tools/paddocksurfacetest.mjs tools/paddockgeotest.mjs
PLAYWRIGHT_MODULE=/path/to/playwright tools/browsertest.sh node tools/capture-pony-surfaces.cjs http://127.0.0.1:8201/tools/ponyvisualtest.html docs/verification/1919
```

Public transfer should use a separate low-priority issue and generic geometry,
profiles, normals/export and corresponding neutral-art evidence. Personal
photos/names, coat identity, pet/feeding gameplay and services stay original.
The public project already has passive winter rugs; its own existing rugs remain allowed.

## Integration review

Root reviewed the complete patch and opened the comparable whole/front/side,
normal/pet, walking/grazing, winter, binder and missing-asset images. Main rebase
preserved the exact measured pony sources, generated GLB and PONY_SURFACE/PADDOCK
configuration sections. The full config hash changed only through the independent
cat integration. Changelog was renumbered to 1478 after the final main fetch.
[Source mapping](integration.json). No repeat broad test run was needed.

The ten local before images were pruned at closure; their links above are pinned
to the delivered evidence revision. Metrics remain. Current images retain the normal
30-day result-image policy. [Reviewed issue results](https://github.com/solwation/lunden-3d-apartment/issues/1919#issuecomment-6819579855).
