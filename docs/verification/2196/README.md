# #2196 corvids all year: verification

Forced scene (the real code, the real app): `?shot&time=11&month=1&day=14&weather=clear&freeze` (January daylight). The snow cover uniform was pinned
to 1 but the shot loop is stopped, so the ground in these frames is NOT snow-covered (limitation); the flocks were pinned to the courtyard lawn (crow,
magpie) and an eave (jackdaws) so the views repeat; everything after that is the seeded behaviour. Script: `tools/corvids2196browser.cjs`.

- `before/before-0.png`, `before/before-3.png`: the same two cameras with `&nocorvids` (before: no corvids at all).
- `after-0.png`, `after-2.png`: the courtyard lawn, a hooded crow (grey, black head) striding, magpies (black/white, long tail) hopping; 1.5 s apart.
- `after-3.png`: jackdaws (black, grey nape) in a row on the roof eave, with a sparrow flock sharing the eave.

Cost (same view, corvid meshes on / off): 238 / 235 draw calls (+3), 536 056 / 531 898 triangles (+4 158 for 21 instances of 198 triangles),
77 / 77 programs (the corvid material is a clone with the same shader), `Birds.update` 0.038 ms per frame in the courtyard on the headless software renderer.
