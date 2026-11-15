# #1958 step 1+2: distance LOD with dithered crossfade, trees

Headless Chromium (SwiftShader), `time=12&month=6&day=15&freeze&weather=clear`, same page toggled between the LOD and
"one level everywhere" with `lod.setRange(1e6, 2e6)` (= `&nolod`), so each pair is the same frame.

Images: `series-z80.png`, `series-z120.png` (park spot -20/z looking north at the courtyard trees from ~55 and ~95 m; before
images in `before/`), `zone-crop-d44|d50|d56-before-after.png` (a courtyard tree at 44 / 50 / 56 m, 10 degree field of view,
cropped and enlarged 4x; left no LOD, right with LOD: the Bayer dither handing the crown and trunk over to the far level).

Draw calls / triangles (renderBufferDirect count, no shadow pass), no LOD -> LOD:

| view | desktop | phone `&lowmem` |
|---|---|---|
| start | 424 / 920 262 -> 426 / 881 144 | 334 / 879 253 -> 317 / 793 413 |
| kitchen | 282 / 565 422 -> 284 / 558 864 | 269 / 591 366 -> 264 / 562 582 |
| living | 313 / 892 753 -> 315 / 874 351 | 290 / 898 886 -> 281 / 836 790 |
| upstairs | 261 / 630 656 -> 261 / 630 656 | 234 / 735 142 -> 233 / 692 836 |
| patio corner | 295 / 816 397 -> 297 / 803 395 | 253 / 740 752 -> 244 / 682 150 |
| park | 439 / 977 910 -> 441 / 958 554 | 322 / 849 350 -> 308 / 779 068 |
| east | 80 / 559 582 -> 82 / 511 844 | 89 / 544 835 -> 75 / 465 149 |

Desktop: +0 to +2 calls (the two far meshes `tree-crowns far`, `tree-trunks far`), -1 to -9 % triangles. Phone: -1 to -17 calls
(near cell meshes whose trees are all beyond the zone are culled instead of drawn empty) and -5 to -15 % triangles.
Full `tools/perfcount.html` (first, whole-view-cull-less version of the helper, before the sphere-cull fix): desktop ALL PASS
(most calls 472 at start <= 520, most triangles 957 838 at park <= 1 000 000); phone `lowmem&w=844&h=390` FAILS its budget with
and without the LOD (start 373-375 > 370, patio corner 967-979 k > 950 k): pre-existing, see the phone numbers above for the delta.
