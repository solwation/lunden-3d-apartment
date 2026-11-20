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
The JPEGs contain the WebGL scene at native desktop resolution. The imported
dimensional comparisons are recorded below. Paired Unreal photos, interactions
and the packaged performance test remain for the playable pilot.

## Imported L1007 dimensions

Six distances from ten placed StaticMesh components in
`/Game/Lunden/Generated/l1007/Level_l1007` were within the ±1 cm criterion on
2026-11-20. The editor ran headlessly with NullRHI on a private copy of the generated
zone using Epic Games’ Authenticode-verified UnrealEditor-Cmd 5.8.4 (0 errors,
0 warnings). This checks the actual imported visual geometry before the playable
pilot level, its collision, controls, paired pictures and packaged performance tests.

| Distance | Independent web reference | Expected cm | Measured cm | Difference cm |
|---|---|---:|---:|---:|
| Vardagsrum, between inside faces at the room label | Entréplan wall polygons 3 and 4 | 534.940 | 534.940 | 0.000 |
| Entréplan finished floor to ceiling | `LEVELS[0].ceiling` | 300.000 | 299.600 | −0.400 |
| Övre plan finished floor to ceiling | `LEVELS[1].ceiling` | 280.000 | 279.600 | −0.400 |
| Stair foot floor to upper landing | Difference between `LEVELS` floor elevations | 325.000 | 325.000 | 0.000 |
| Entréplan interior door structural opening between wall faces | Plan door 3, hinge to opposite wall endpoint | 90.990 | 90.990 | 0.000 |
| Last tread to adjoining upper landing | Floor rise divided by the 15 configured treads plus the landing | 20.3125 | 20.513 | +0.200 |

The floor and ceiling finish sheets are each drawn 0.2 cm into the room in
`src/world.js`. This accounts for the 0.4 cm clear-height differences and the
top landing's 0.2 cm offset from the nominal last riser. Door width here is the
structural opening, before trim. The floor-to-floor stair rise includes both landings.

The [editor sampler](../../../tools/unreal-engine/python/measure_pilot.py) uses
stable IDs to locate components and transforms the corners of each mesh's local
bounding box into world space. The selected floor, ceiling, wall and tread faces
are planar and axis-aligned at the sampled sections. The [comparator](../../../tools/unreal-engine/check-pilot-distances.mjs)
checks those sections against room/door positions, takes differences between
the observed faces, and derives expectations from `data/plan.json` and
`src/config.js`. Exported measurements, actor locations and coordinates embedded
in the names supply none of the distances.

The [raw bounds, asset IDs, hashes and comparison](imported-distances.json)
record the level's SHA-256 and the import's GLB digest. The original export
identified source revision `3b4b65fe` with a dirty source tree. The map and all
ten sampled mesh packages in the private copy matched the import stamp byte-for-byte.
The comparator used the published web sources at `e5e97ef5`.

To repeat, use a separate Windows checkout with the editor module and the #2245
L1007 import available. Run from its repository root, with a temporary output
path free of spaces.

```powershell
$observed = (Join-Path $env:TEMP "lunden-2246-observed.json").Replace('\', '/')
.\tools\unreal-engine\run-python.ps1 tools/unreal-engine/python/measure_pilot.py $observed
node tools/unreal-engine/check-pilot-distances.mjs $observed
```

The comparator exits nonzero for a missing or misplaced face or a difference
above 1 cm. The saved observations can also be checked without the editor by
passing `docs/verification/2246/imported-distances.json` as the argument.
