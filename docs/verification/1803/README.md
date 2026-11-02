# #1803: the western hospital car park under the feathered band

The pale field patch from #1794 is not the cause: SITE.south field 165719101 lies west of the car park and does not overlap it.
The asphalt of OSM 145221622 (x -33..26, z 468..531) was hidden by `EDGE_BACKDROP.skirt` (the +0.08 m band south of the terrain edge z 460),
whose south side started at x -12 and so covered everything east of it. It now starts at x 30. Data change only, no new draw calls.

- `before-/after-h000.png`: the #1794 h000 camera (`?at=142.3,528.3,58,-30,110`).
- `before-/after-top.png`: top view (`?at=-60,490,0,-89.9,150`).
- `before-/after-closeup.png`: top view over the hall (`?at=0,500,0,-89.9,120`); the asphalt used to stop at x -12.

All made with `&test&shot&time=13&month=9&day=20&freeze&weather=clear`, fov 35, headless Chromium (swiftshader).
