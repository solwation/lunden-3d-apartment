# #1967 Entrance plants: a still far copy with a dithered fade

Run: `tools/browsertest.sh node tools/entrancelodtest.cjs http://localhost:8596 OUT desktop` (and `lowmem`), real game, no
`&test`, `time=7&month=7&weather=clear&freeze`, 1280 x 800 (phone profile 844 x 390). Each view is rendered twice in the same
frame state: far level off (`lod.setRange(1e6, 2e6)`, the plants' own meshes everywhere) and on. Calls and triangles are
`renderer.info.render` after `__app.frame(0.016)` (the whole frame, shadow pass included); "plant calls" are the entrance
plants' own colour submissions.

| View (desktop) | calls off -> on | triangles off -> on | plant calls off -> on | plant shadow calls off -> on |
|---|---|---|---|---|
| 4 m from a door | 478 -> 478 | 804 552 -> 804 552 | 10 -> 10 | 35 -> 35 |
| 16 m (in the zone) | 437 -> 429 | 856 166 -> 863 622 | 34 -> 26 | 34 -> 26 |
| 25 m | 401 -> 369 | 820 800 -> 822 816 | 33 -> 1 | 14 -> 1 |
| 35 m | 438 -> 413 | 911 898 -> 914 698 | 26 -> 1 | 1 -> 1 |
| along the facade, 12 m | 259 -> 243 | 690 625 -> 693 609 | 35 -> 19 | 21 -> 22 |

Crops of the plants (4x, left off, right on) differ in at most 0.05 % of their pixels (`changedShare` in the log).

Phone profile (`&lowmem`, measured before the far level was limited to desktop): 25 m 292 -> 287, 35 m 311 -> 308, but 16 m
338 -> 339 and along the facade 217 -> 218, because `src/entranceplantbatch.js` already draws the phone's plants in 4 – 10
instanced calls. Phones therefore keep the plain meshes (identical to before); `entrancelodtest-lowmem-before-gating.log` is
that measurement, its two FAILs are the reason.

Images: `desktop-near-4m.png`, `desktop-zone-16m.png`, `desktop-far-25m.png`, `desktop-far-35m.png` (far level on);
`desktop-zone-16m-crop-off-on.png`, `desktop-far-25m-crop-off-on.png` (off | on).
