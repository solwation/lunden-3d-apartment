# #2131 Species tree forms: verification

The site's trees get species-specific crowns (maple broad and round, lime domed, oak irregular and lopsided, birch narrow with
hanging lobes), branch orders through the crown (main limbs, second limbs, fine twigs; birches drooping), and per-tree turn, lean
and size spread (`src/treeform.js`, `TREE_FORM` in `src/config.js`, all *guess*). `before/` is the baseline `5498de36` served in
place of the branch's `foliage.js`, `surroundings.js` and `config.js` in the same browser run, same cameras.

## Checks

1. `node --test tools/treeformtest.mjs`: 6/6 pass. Covers deterministic species and forms from the position alone (desktop and
   phone); the species mix per site kind; species shapes (birches narrower for their height than maples, limes taller domes,
   oaks leaning more and more lopsided, per-tree height spread, lean within the species cap); the per-tree budget (at most 6
   lobes, phone caps, trunk 166 / phone 64 triangles, the far trunk 32 / phone 14, both bark geometries carry four branch orders,
   birch twigs hang, bark twigs climb); crowns above the stem top and within the envelope with x/z at the foot; and the
   skeleton helper (axis from the foot as long as the stem, main limbs leave the stem, climb, taper and end inside the crown).
   Also passing: `barksurfacetest` (triangle counts now read from the layout), `lodtest`, `sitewindtest`, `siteinstancebatchtest`.
2. Browser (`tools/treeform2131browser.cjs`, SwiftShader, the game itself, July / January 13:00, clear, wind 0, 960 × 600):
   four places, summer and winter, before and after. No page errors and no shader errors in either phase (the only console
   errors were the blocked CDN tunnel and a 404, the same before and after). `browser.json` holds the raw numbers.

| View | Calls before → after | Triangles before → after |
|---|---|---|
| Park forest, near (`park-near`) | 41 → 41 | 344,720 → 345,432 |
| … winter | 40 → 41 | 323,940 → 323,132 |
| Bridge, park edge (`bridge`) | 46 → 46 | 366,528 → 382,134 |
| … winter | 44 → 44 | 331,536 → 339,522 |
| Park from 30 m up, far (`park-far`) | 45 → 45 | 422,448 → 437,544 |
| … winter | 43 → 43 | 344,662 → 347,466 |
| Courtyard green between Hus A and B | 109 → 108 | 584,499 → 599,773 |
| … winter | 104 → 103 | 521,429 → 520,671 |

Scene tree instances: trunks 1907 + birches 15 → 812 + 15 (the river park's separate angled limb instances of #533 are now part
of the trunk geometry), crown lobes 2244 → 3129, far copies alike. Per instance: near trunk 46 → 166 triangles, far trunk
14 → 32, lobes unchanged (60 near, 36 far). Programs per view equal or fewer.

## Images

- `park-near.jpg` / `park-near-winter.jpg` (and `before/`): inside the river-park forest; the winter view shows the branch orders.
- `bridge.jpg` / `bridge-winter.jpg`: the park edge by the bridges: a birch, maples, limes and oaks of different form and lean.
- `park-far.jpg` / `park-far-winter.jpg`: the valley from 30 m up, mostly far-LOD trees; in winter the far trunks keep limbs.
- `courtyard.jpg` / `courtyard-winter.jpg`: the courtyard green between Hus A and B.

## Cost

No new draw calls, materials, programs, textures, lights or passes; no per-frame work. Geometry: two shared trunk geometries of 166
triangles (bark and birch) instead of one of 46, a 32-triangle far trunk; about 900 more crown lobe instances and about 1100 fewer
trunk instances (instance buffers near and far roughly even, ±10 KB). Startup builds the forms once (a few thousand small transforms). Phones (`lowMemory`): at
most 2 lobes on ordinary trees and 3–4 on the big ones, 64-triangle trunks and the old 14-triangle far trunk; phone frames were
checked through the helper test, not in a phone browser.

## Houses and scope

Not a house geometry change; the courtyard trees by Hus A/B/C keep `fitCrown`'s clearance per lobe (an outer lobe is pulled in
before it is squeezed). Unchanged: the weeping birch/willow specimens (#1531), the understory and pavement shrubs, courtyard
plantings and vines, the far southern woodland, seasons, LOD zones, wind sway, bark and leaf textures, collision and the site's
random stream (every other random layout is identical).

## Limits

Species are a deterministic draw per position, not a tree survey. Branches are straight tapered limbs (no curvature) and the lobes
still use one shared leaf atlas, so leaf shapes do not differ by species. Not tested on a physical Iris 640 or phone.

Publicering: Pages/Worker success på `2391335`; före-bilder borttagna vid stängning och visas från den commiten.
