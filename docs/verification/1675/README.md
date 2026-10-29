# #1675 hospital-lawn trees: verification

27 big broadleaf trees (`SITE.south.bigTrees`) as instances of the existing south woodland batches. Software-GL headless Chromium, `time=13&month=9&day=20&freeze&weather=clear`.

| Measure | Before | After |
|---|---|---|
| South backdrop triangles, desktop | 55 057 | 56 461 (+2.6 %) |
| South backdrop triangles, `&lowmem&quality=0` | 54 637 | 55 879 (+2.3 %) |
| Crown instances | 70 | 97 |
| Draw calls, ground view `at=30,340,90,-6,4` | 40 | 40 |
| Whole-frame triangles, same view | 314 951 | 316 311 |

Draw calls in the north view were not measured after the change (the page returned `renderer.info` 0 there); the trees add instances to the two existing meshes, so none can be added. Before, that view: 115 calls, 554 420 triangles.

Images: ground view among the pavilions, before `before-lawn-ground.png`, after `after-lawn-ground.png`; the north view `before-from-north.png` / `after-from-north.png` is hazy and the trees are barely visible from that far.
Not shown: the Google camera `sjukhusomradet-fran-norr` itself (it looks at the campus), and a clean aerial view over the hospital area (that capture came out blank).
