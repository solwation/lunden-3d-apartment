# L1007 pilot reference cameras

The web reference uses the L1007 production scene at `c72ecad6e62d4a4dfdf598964212787b1041b6fd`.
The [shared camera list](../../../unreal/Lunden/Tests/views.json) fixes a 1440 × 810
viewport, 72° vertical field of view, clear weather and June 21, 2026. Street,
living room and patio use 14:00 Lund time. The stairs and upper floor use 22:00
with the interior lamps switched on.

| View | Unreal eye X, Y, Z (cm) | Unreal yaw, pitch (°) |
| --- | --- | --- |
| [START, across the street facing the entrance](start.jpg) | 287.5, −1200, 162 | 90, 8 |
| [Living room facing the glazed patio door](living-room.jpg) | 250, 820, 162 | 97, −4 |
| [Entrance floor facing the lower flight and turn](stairs.jpg) | 215, 738, 162 | −7, 8 |
| [Upper floor facing the south window, bed and desk](upper-floor.jpg) | 175, 795, 487 | 100, −3 |
| [Patio facing the south facade](patio.jpg) | 230, 1610, 162 | −82, 12 |

## Matching the cameras in Unreal

The list records foot positions in web metres. Add the standing eye height
(1.62 m) before converting to Unreal centimetres. The tested
[axis functions](../../../tools/unreal-engine/coordinates.mjs) map the resulting
web `(x, y, z)` to Unreal `(100x, 100z, 100y)`. Subtract web yaw from −90° and
normalize it to obtain Unreal yaw. Pitch keeps its sign and roll is zero. At
16:9 the equivalent horizontal field of view is 104.504864°.

## Capture

Serve this checkout with `python3 -m http.server 8846 --bind 127.0.0.1`.
With Playwright and full Chromium available, run the [capture script](../../../tools/unreal-engine/capture-web-views.cjs)
from the repository root.

```sh
tools/browsertest.sh node tools/unreal-engine/capture-web-views.cjs http://127.0.0.1:8846 docs/verification/2246
```

`PLAYWRIGHT_MODULE` selects the Playwright installation. `CHROME_PATH` selects
the browser executable. Optional `THREE_DIR` serves the pinned three.js 0.170.0
package from local disk.
For Windows hardware rendering, the runner can call Windows Node and Chrome
through the same browser lock (supply Windows paths to both). The script starts
the full desktop scene once and uses the game's camera, lighting and renderer
for each image. Its logs include the equivalent direct browser URL and the
measured web and Unreal camera parameters.

The recorded run used Windows Chrome 157.0.8103.79, Playwright 1.58.2, and
ANGLE Direct3D 11 on an NVIDIA GeForce RTX 3080. Each capture checks the actual
desktop Ultra level (4), view direction, eye position, field of view, aspect
ratio, frozen date and hour, weather, lights setting and live WebGL context.
The JPEGs contain the WebGL scene at native desktop resolution. The Unreal
photos, dimensional comparisons, interactions and packaged performance test
remain part of the pilot once its level is available.
