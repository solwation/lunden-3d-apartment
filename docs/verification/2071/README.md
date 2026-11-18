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

Each JPG is a matched sheet: **before above, after below**.

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
