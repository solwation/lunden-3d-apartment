# #1804: darker, denser tree canopy (Google 3D review 2026-11-02)

`<view>-google-fore-efter.jpg`: left the Google 3D reference (`docs/references/google-3d-2026-11-02/bilder/<view>.jpg`),
middle the game before (base a7405ae8), right after. Same cameras and recipe as the reference README (`time=13&month=9&day=20`,
fov 35°, fog and cloud deck hidden in the page only, headless Chromium/SwiftShader, 1456×831). Cameras are ±10–20 m off Google's.

- `01_huvudbyggnad_h090`: the valley woodland west of the hospital (left) and the lawn trees between the pavilions.
- `04_nybygge_h090`: Höje å valley next to the Lunden plot: darker, bluer canopy and the desktop infill trees in the gaps.
- `05_norra_skolor_h000`: the trees around the schools.
- `00_oversikt_h000`: the overview: the whole canopy reads dark green instead of yellow-green.
- `03_sodra_bebyggelse_h180`: the valley from the south, wider crown-size spread.

Season spot checks after the change (unchanged `SEASON.trees` months): `efter-oktober-04_nybygge_h090.png` (autumn yellows, oranges
and reds as before) and `efter-januari-04_nybygge_h090.png` (bare branches, snow).

Measured (perfcount, SwiftShader, same machine, before | after): desktop peak calls 468 | 468, peak triangles 912 384 | 914 088
(park; +1.7–6 k per view); phone `lowmem&w=844&h=390&quality=0` peak 343 | 343 calls, 890 460 | 890 399 triangles (no new trees).
Tree batches on desktop: 21 crown / 24 trunk InstancedMeshes before and after; +36 crown and +36 trunk instances (+3 816 triangles).
`south-crowns`: 435 instances before and after; `southbackdroptest` 58 933 < 59 000.
