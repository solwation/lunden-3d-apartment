# #1808: outdoor ground between the houses of Kallby ängar and the housing in the north

`07_bostader_norr_<h>_google-fore-efter.jpg`: Google 3D (left), game before (middle), game after (right), cameras from the `used at` values of
[the Google 3D README](../../references/google-3d-2026-11-02/README.md). Most of these frames look at terrain buildings, so the new ground only shows at the far edges.
`nordvast_fore-efter.jpg` (before | after, `?at=-300,-60,53,-25,110`) shows the new area itself; `ovanifran_fore-efter.jpg` (`?at=-540,-90,0,-85,190`, near top view, hazy: the fog stays on) shows the layout.

Change: `EDGE_BACKDROP.ground` (OSM, [osm-north-ground-2026-11-02.json](../../references/surrounding-views/osm-north-ground-2026-11-02.json)): 19 car parks, lawns/parks/pitches, scrub, a pond,
52 roads, 41 paths and a ditch as flat polygons/ribbons in the existing `edge-land` batch. Colours, widths and lifts are *guess*. Phones skip them (`lowMemory.ground`).

Measured (headless Chromium, SwiftShader): draw calls unchanged in every view (07_h000 223 -> 223, h090 361 -> 361, h180 335 -> 335, h270 160 -> 160, nordvast 18 -> 18, top 14 -> 14);
triangles +2 609 in each (e.g. 07_h000 627 412 -> 630 021). `&lowmem` nordvast: 17 -> 17 calls, 222 430 -> 222 430 triangles (identical). `node tools/edgebackdroptest.mjs` green (6 new checks).

Limitation: the trees that hide most of this ground in Google are #1804; small objects (hedges, benches) were not added.
