# #1805: outdoor space between the hospital buildings south of Höje å

`<view>_google-fore-efter.jpg`: Google 3D (left), game before (middle), game after (right), same camera. Cameras are the `used at` values of
[the Google 3D README](../../references/google-3d-2026-11-02/README.md): `01_huvudbyggnad_h000/h090/h180`, `02_vastra_kvarteret_h000/h270`.
`close_hedge_fore-efter.jpg` is a close view (-8, 238, yaw -52, pitch -15, 12 m) of the new hedge by car park 145221619.

Change: clipped hedges (1.0 x 0.8 m, *guess*) along one long edge of four hospital car parks (OSM 145221619, 145221626, 145221628, 145221629),
33 boxes in the south backdrop's existing `land` batch via `SITE.south.yard` (the #1737 `yard` mechanism). Phones (`lowMemory`) skip them.

Measured (headless Chromium, SwiftShader): draw calls unchanged in every view (e.g. 01_h000 380 -> 380, 01_h090 420 -> 420);
triangles +396 (950 574 -> 950 970). `&lowmem` 01_h000: 303 -> 303 calls, 765 609 -> 765 609 triangles. `southbackdroptest` far detail
58 933 -> 59 329 (limit raised 59 000 -> 60 600, see docs/development/performance.md); `edgebackdroptest` green.

Limitation: at the 160 m reference distance 1 m hedges are only a few pixels wide, so the visual gain is small. Lawn patches, beds, benches,
bike racks and bay lines were not added (invisible per triangle or against the #1794 budget decision).
