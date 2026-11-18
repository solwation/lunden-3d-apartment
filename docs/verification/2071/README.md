# Hus L brick relief and roughness — #2071

Baseline `8111f1e3`; candidate inputs are SHA-256 bound in `browser.json`.
The old `src/exterior.js` is served from that exact baseline only during the before phase.
Every other fixture/module/input, camera, material colour canvas and light is identical.
Chromium / SwiftShader, 1200 × 800 canvas, DPR 1, MSAA, NeutralToneMapping.

## Result

The retained half-bond colour tile gains shallow light-responsive mortar and fine clay grain.
There is no displacement, silhouette or opening change. `BRICK_SURFACE` values are artistic
assumptions, not verified specifications for Peab's brick: 2.52 mm virtual face-to-mortar
depth (`bumpScale × red-channel range`) and about 0.11 mm face-grain amplitude.

Each JPG is a matched sheet: **before above, after below**. The corrected sheets are
1200 × 1676: two native 1200 × 800 captures, each preceded by a 38-pixel label band.
There is no scaling, aspect-ratio change or clipping.

- `facade.jpg`: Hus L's full street facade from the west.
- `entrance.jpg`: the existing neighbour entrance, window, trim and brick beside them.
- `grazing.jpg`: along the facade at walking-eye height, where recessed joint edges catch light.
- `distant.jpg`: distant facade view; fine detail is filtered rather than resolved as grain.

The component uses the actual production `buildExterior` with the authored plan's dimensions,
patio/fence data, window settings and nominal exterior-door openings. It deliberately excludes
the full world, the own flat's separate interior/window builders and gameplay. This proves the
changed facade material and its production geometry, not a complete walk or device performance.

## Verification

1. `node --test tools/bricksurfacetest.mjs`: **2/2 pass** (`node-tests.txt`).
   Deterministic red height / green roughness masks, all eight bed joints, half-bond perpend
   offsets, raised faces, shallow depth, one cached linear texture, CanvasTexture-compatible
   orientation and native mip filtering.
2. One scoped browser test: before/after use the exact same production exterior inputs.
   All **153 neighbour panes** are exposed glass, within their opening bounds; all **eight
   street/courtyard × storey combinations** remain. SHA-256 of every emitted mesh position,
   UV and index and all opening metadata is identical. Zero page, console or shader errors.
   The four matched views retain submitted calls/triangles exactly:

   | View | Draws before → after | Triangles before → after |
   | --- | --- | --- |
   | Full facade | 24 → 24 | 21,460 → 21,460 |
   | Entrance | 35 → 35 | 63,286 → 63,286 |
   | Grazing | 43 → 43 | 63,122 → 63,122 |
   | Distant | 117 → 117 | 78,342 → 78,342 |

   These counts cover this frozen component fixture, not the whole app. The changed brick
   mesh itself stays **1,468 triangles**. Browser images were opened for visual inspection.

The first capture passed functional checks but its relief/grain was too faint at normal
viewing scale. The final shallow-depth adjustment reran only this same scoped check;
the saved images, source hashes and JSON are the final result. No global suite was rerun.

## Resource cost

The original diffuse canvas is unchanged. One additional shared **512 × 512 RGBA8** texture
packs height in R and roughness in G and supplies both maps: **1,048,576 bytes CPU data**;
the complete 512…1 mip chain totals **1,398,100 bytes GPU storage** (about 1.333 MiB), excluding
driver overhead. No separate height or roughness texture is allocated per facade.
The fixture's uploaded texture count is **5 → 6**, geometries remain **64**, shader program
count remains **11** (the brick program's implementation changes). Standard material bump
uses three height samples plus one roughness sample and the extra UV varyings. There are
no added lights, geometry, draws, shadow casters or passes. No GPU/frame-rate improvement
or physical-device result is claimed.

## House equivalents and downstream

- **L:** the shared textured `bricks` batch changes, including existing street/courtyard skins,
  reveals and circular stair drums. Existing plain pilasters and render are separate materials.
- **A:** `surroundings.js:aHouseParts` splits the authored shell into grid and plain facade
  variants; the grid includes painted openings and other faces have mapped window decals.
- **B:** the same split builder uses B's own openings/loggias/garage cuts.
- **C:** the same split builder uses C's own stepped/recessed variant and mapped openings.

No L colour/relief atlas is copied onto A/B/C or their CoreHouse interior materials. Their
dimensions, openings and render budgets are untouched. The public project has the same
neutral Hus L brick recipe; selective transfer is relevant and belongs to its own issue.
No personal asset, gameplay or service is needed by this helper.

## Reproduction

```sh
python3 -m http.server 8183
node --test tools/bricksurfacetest.mjs
PLAYWRIGHT_MODULE=/home/olof/github-dashboard/node_modules/playwright \
  BROWSERTEST_TIMEOUT=5m tools/browsertest.sh node tools/bricksurface2071browser.cjs \
  http://localhost:8183 docs/verification/2071
```

The script routes the pinned Three.js URL to the existing local three-0.170.0 cache for
repeatable offline loading; source modules come from this owned checkout. No production
storage or network service is used. The conductor owns publication and closure.

## Publication

Published on main as `7b5f0f1740c02d7f7731e34a067563b4b88239e9`.
[Pages44262927980](https://github.com/solwation/lunden-3d-apartment/actions/runs/44262927980)
and [Worker44262928008](https://github.com/solwation/lunden-3d-apartment/actions/runs/44262928008)
both succeeded on that exact revision. Three representative sheets from that first publication were embedded in the issue with
permanent revision URLs verified HTTP200 before its initial closure. Those sheets were later
found to be vertically compressed by the contact composer; their visual evidence is superseded
by the corrected sheets below. Product implementation and functional measurements were unaffected. At that first publication, source modules and fixtures matched the accepted worker bytes;
only independent constant additions and changelog1601 differed from its base.
The neutral public adaptation is tracked in
[kvarteret-lunden#293](https://github.com/solwation/kvarteret-lunden/issues/293).


## Image-only contact-sheet correction

The issue was reopened after inspection found that the earlier composer drew each 1200 × 800
capture into 1600 × 533 pixels, changing the facade proportions. Only the composer is corrected:
the same four before/after views were recaptured at their original native 1200 × 800 pixels and
placed unscaled into 1200 × 1676 sheets (38-pixel label bands, 838-pixel row pitch). Decoded image
dimensions are checked before composition; no row is clipped. These four JPGs replace the
old distorted sheets. All four corrected sheets were opened and inspected.

Corrected fixture SHA-256: `1b5bf32af3de9efd2163bee2e5d03fa4771b060702776a4fe02853ff6c07f9fd`.
`browser.json` records this exact fixture hash, source/module hashes and the composition's
source/sheet dimensions and scale `[1,1]`. The new narrow browser run again passes all 153-pane,
opening/bounds/geometry and four-view draw/triangle checks, with zero errors and unchanged
counts above. Its peak was 1262 MiB under the 4 GiB wrapper ceiling. No Node tests or unrelated
browser checks were repeated: product `src/exterior.js` and `src/bricksurface.js` were compared
byte-for-byte with published source `7b5f0f1740c02d7f7731e34a067563b4b88239e9` and are unchanged.
No product code, material, camera, rendering resolution or geometry was modified.

The conductor publishes this correction and a new revision-pinned image comment before
closing the reopened issue, and records any actual workflow run triggered by the correction.

Corrected image publication `c0145dc763a84ba5d1f75f540f2329ad2f69efc2`: Pages44264726768 success, all three embedded image URLs HTTP200. Replacement comment before reclosure: https://github.com/solwation/lunden-3d-apartment/issues/2071#issuecomment-6972896844. Worker not triggered by this tool/image correction; product bytes unchanged.
