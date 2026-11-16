# #1972: hedge LOD measured, not adopted

A coarse far level (cell 1.0 m, dents halved) for the 8 courtyard patio hedges (`patio-hedge`) and the entrance boxwood, faded by
`BatchLod` (zone 18-26 m from the run's bounding box), was built and measured; the implementation lives only on the local branch
`issue-1972-impl` (with `tools/hedgelodtest.cjs`, which measured this and saved lod/nolod images). Raw numbers: `measurements.json`.

Triangles per level (desktop): patio hedge 376 -> 76 (x8), boxwood 1 792 -> 628; all hedges 4 800 -> 1 236, i.e. at most 3 564 triangles
saved in the best case (everything far). The "25 748 triangles" in plants.md was from before the cell was coarsened (#1223).

Draw calls / triangles, far level off -> on (desktop):

| view | off | on |
|---|---|---|
| patio near (hedges 4-29 m) | 269 / 633 400 | 270 / 634 028 |
| patio mid | 327 / 815 964 | 332 / 814 580 |
| patio far (hedges 42-51 m) | 403 / 861 648 | 403 / 858 084 |
| boxwood near | 328 / 730 028 | 332 / 729 432 |
| boxwood mid-zone | 356 / 823 680 | 357 / 822 208 |
| boxwood far | 404 / 915 690 | 404 / 912 126 |

Phone (`&lowmem`, only the boxwood has a far level there): -1 164 triangles at best, +0 to +1 call in the zone.

Result: at most -0.4 % triangles, never fewer draw calls (the hedges are one draw each, near or far), and +1 to +5 calls inside the
zone where both levels draw. The exposed-hedge view sits at the 520-call cap (performance.md), so the zone's extra calls are a net
risk. Not adopted.
