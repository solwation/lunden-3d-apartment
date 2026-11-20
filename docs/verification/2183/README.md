# Stairwell daylight and surface detail (#2183)

Real app (Chromium/SwiftShader, `?shot&…&freeze&weather=clear&quality=3`), 960×600, taken with
`tools/stairdaylightshots.cjs`. "Before" = `&nostairday` (the old flat lamp-only look; uDay = uDetail = 0, same output as main).

| Image | View (`at=`) | What it shows |
|---|---|---|
| `L-noon.png` / `before/L-noon-before.png` | Hus L `-17.5,5.2,0,4,0` up the flight to the stair window | Noon: the landing floor and ceiling brighten towards the window, the ceiling darkens away from it; beige stair underside and blue-grey railing keep their colour. Before: evenly lit. |
| `L-night.png` | same, `time=23` | Night: no daylight term (lamps only, as before) plus the paint grain / wear band; dark window. |
| `A-noon.png` / `before/A-noon-before.png` | Hus A `1.3,36.6,0,2,0` north through the lobby to the entrance glass | Dimmer hall in the foreground, light floor and walls by the entrance glass. |
| `B-noon.png` / `before/B-noon-before.png` | Hus B `-33.9,42.6,0,2,0` north along the lobby corridor to the door and sidelight | Same gradient along the corridor (camera fixed: the old view showed only sky). |
| `C-noon.png` / `before/C-noon-before.png` | Hus C `-60.9,24.0,-90,2,0` east through the lobby to the entrance glass | Same gradient towards the entrance. |

Pixel statistics printed by the script (mean luminance 0–255 / share of pixels with all channels ≥ 250 / mean saturation;
the 1.1 % blown share is the white QR card of the shot HUD in every image):

| View | before | after (noon) |
|---|---|---|
| L | 228.9 / 0.011 / 0.042 | 224.2 / 0.011 / 0.042 (night 205.3 / 0.011 / 0.044) |
| A | 233.7 / 0.011 / 0.032 | 221.6 / 0.011 / 0.034 |
| B | 232.3 / 0.011 / 0.032 | 216.1 / 0.011 / 0.034 |
| C | 234.2 / 0.011 / 0.031 | 216.0 / 0.011 / 0.032 |

Cost (renderer.info after a frame, origin/main → branch): Hus L view 124 calls / 462 051 triangles / 93 programs → identical,
textures 42 → 43; Hus A view 428 / 950 458 / 122 → identical, textures 92 → 93. With `&lowmem` (phone profile) both views are
identical to main (no attribute, no patch, no texture).

Houses checked: A, B, C (`src/corehouse.js`, one shared implementation) and L (`src/core.js`); each core's own panes are its
daylight sources; Peab geometry, glass and passages untouched.
