# #1971 bike yard bikes: dither LOD

`measure.cjs` (run via `tools/browsertest.sh`, real render without `&test`, 1280x800, SwiftShader, June noon) counts draw calls and
triangles to the screen (no shadow pass) from three spots north of the yard looking south (`at=-56,z,180`; z = -8 / -16 / -30, i.e.
~10 / ~18 / ~32 m from the nearest bikes: near, mid-transition (zone 16-22 m), far), with the LOD and with `&nolod`. Results in `run3.log`.

| view | no LOD calls / tris | LOD calls / tris |
|---|---|---|
| near (3 bikes already in the far buffer, margin) | 200 / 768 854 | 205 / 719 652 |
| mid (inside the zone, both levels) | 230 / 814 653 | 236 / 770 831 |
| far (coarse level only) | 260 / 881 502 | 261 / 810 836 |

CAUTION: `&nolod` also switches off the tree LOD (#1958), so these totals include the trees' +calls/-triangles; they are not the bikes
alone. The bikes' own effect: calls unchanged outside the zone and +4 inside it (four far meshes), triangles -~800 per bike that is
fully far (9 bikes: ~7 k, ~1 % of a view). Phone `&lowmem` (zone 11-16 m) was measured in a first run from other spots (no usable
images there): same pattern (near 631 -> 598 k, far 782 -> 709 k, calls -5 to -10, trees included).

Images: `near|mid|far-lod.png` / `-nolod.png`, and `crop-*-nolod-vs-lod.png` (left no LOD, right LOD; mid is enlarged 5x: no visible
jump in the zone). Shadows follow the level (the depth materials carry the same dither). Not tested: shadows close-up, a ridden bike
across the zone in the browser (covered by the node test `InstanceLod.relocate`), the courtyard rack (not split, see performance.md).

**Outcome (conductor, 2026-11-16):** not adopted – ~1 % fewer triangles against +4 calls in the zone, and the yard bikes had no switch to smooth. Images were not committed; the prototype is archived (see the issue).
