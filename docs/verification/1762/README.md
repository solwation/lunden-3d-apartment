# #1762 Nordic Wellness on the right side of Sankt Lars väg, at full size

Headless Chromium (SwiftShader), 1280×720, `month=9&day=15&weather=clear`, DOM overlays hidden. `fore-` = origin/main 3e2a65e0 (#1756 state), `efter-` = this change.

- `fore-rapportvy.png` / `efter-rapportvy.png`: `?at=-135,-85,15,-35,75`, roughly the in-game report's view (2f4c7c13) over Sankt Lars väg towards the bend. Before: a small box west of the road (on the 1177 geocode, which is OSM "Grenhuset"); after: the 68.8 × 36.7 m sportcenter east of the road beyond the bend.
- `fore-mot-soder.png` / `efter-mot-soder.png`: `?at=-373,-341,-116,-32,134`, the camera of the user's Maps view `docs/nordic-wellness-st-lars-maps-mot-soder.jpg` (55.689674 N, 13.1821921 E, 134 m, heading 174°, tilt 58°). After: the gym left of the road, as in Maps (Skånevägen is not modelled).
- `fore-mot-norr.png` / `efter-mot-norr.png`: `?at=-60,-190,41,-28,80`, the heading of `docs/nordic-wellness-st-lars-maps-mot-norr.jpg` (17°) from closer in. After: the gym right of the road beyond the bend, brick road face with the low part, glass along the park face, as in Maps.
- `efter-fran-vagen.png`: `?at=-120,-290,95,-4,4`, from Sankt Lars väg east of the bend: the low brick part at the road end and the glass corner.
- `efter-ostgavel.png`: `?at=-140,-430,158,-8,14`, the far ENE end standing on the flat ground beyond the terrain edge (z -340), without a gap.

Checks: `tools/eastbackdroptest.html` 51/51 PASS (campus 82 234 triangles, budget 84 700), `tools/farwalktest.html` PASS, phone `perfcount` (`?cloud=&lowmem&w=390&h=844&weather=clear&freeze`): start 300 calls, max 320 calls / 827 226 triangles at "patio far" (budgets 370 / 950 000).
