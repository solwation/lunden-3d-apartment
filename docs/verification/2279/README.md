# Hus L, Hus A/B/C and the garage in the Unreal export (#2279)

Unreal Editor 5.8.4 on Windows 11, 2026-11-21, export of `28b1ad07` (exported before a rebase as `ff93f47e`; same
source hash, so `check-export.mjs` reports it current on `28b1ad07`). Everything ran headless (`-nullrhi`, or
`-RenderOffScreen` for the pictures). How it works: [unreal.md, Buildings](../../development/unreal.md#buildings-hus-l-hus-abc-and-the-garage-2279).

## Export

```text
node tools/unreal-engine/check-export.mjs
Unreal export is current: 7 files, 4233 nodes (4233 ids, each in one zone), 271 sources (exported from ff93f47e, HEAD ff93f47e)
after the rebase: … 271 sources (exported from ff93f47e, HEAD 036f7a5b)
```

- Zones: `l1007-entre` 4 nodes / 43 triangles, `hus-l` 1,197 / 235,635, `kvarteret` 349 / 282,367. The export fails if
  an object of the buildings' builders (exterior, visit, core-l, core-abc, garage, portik) lands in no zone; none did.
- `l1007.glb` (`90901e84…`), `l1007-uteplats.glb` (`032dd86a…`) and `fixture.glb` are byte-identical to the export
  before #2279 (`30e49f93`). The re-import skipped them with every package file byte-identical.
- Two exports from the same commit were byte-identical (checked at `61e12d99`, the first slice).
- Web page unchanged: no file in `src/` changed, and `tools/stamp.sh`'s content hash is `4b10f2b3839f` before
  (`30e49f93`) and after (`89a714a3`, `28b1ad07`).

## Measurements

[`exterior-result.json`](exterior-result.json) is the output of `tools/unreal-engine/tests/test_exterior.py` in Play In
Editor (Automation: 1 passed, 0 warnings, exit code 0). Each ray is cast by the exporter on the exported nodes and
traced in Unreal against the zone's imported actors; it must hit the same node within 1 cm, or nothing for the portik.

| House | Rays | Within 1 cm on the same node | Max error | What |
|---|---|---|---|---|
| L | 7 | 7 | 0.000 cm | street and courtyard façades (z −0.006 / 12.705 m), west and east gables (x −41.761 / 11.586 m), roof, stairwell west wall (x −18.95 m = `CORE.x0`), portik passage clear |
| A | 7 | 7 | 0.000 cm | north, east, west façades on `SITE.blocks` (z 28.8, x 9.42, x −9.76), south loggia rail, roof, stairwell floor, entrance glass |
| B | 7 | 7 | 0.000 cm | north, east, west façades (z 33.3, x −22.6, x −41.74), south loggia rail, roof, stairwell floor, entrance glass |
| C | 7 | 7 | 0.000 cm | north, east, west façades (z 12.6, x −51.4, x −70.6), south loggia rail, roof, stairwell floor, entrance glass |
| garage | 4 | 4 | 0.000 cm | floor (y −2.997), deck soffit (−0.35), park-side wall (z 33.16), west wall (x −60.14) from inside |

Intentional glass and passages: the three entrance glazings (A, B, C: the cores' `glass` holes) are hit on their glass
node in both, and Hus L's portik passes clear in both.

The first run, without the in-memory settings, failed 8 of 32 rays: 7.7 cm off on Hus L's street façade, the three
south loggia rails, the A/B entrance glass and the deck soffit not hit, and the garage wall ray passing the shell to
Hus B's façade. See [unreal.md](../../development/unreal.md#buildings-hus-l-hus-abc-and-the-garage-2279).

## Pictures

The shared `start` camera and a `courtyard` camera (x −3, z 22, 6 m up, yaw 100°, pitch −10°, day). The cameras match
within 0.01 cm and 0.001° ([`unreal-capture.json`](unreal-capture.json)). L_Lunden has no lighting of its own, so
capture_l1007.py's temporary rig lights the views. The zones are streamed into `L_Lunden` in memory with Nanite off.
Brick and other web textures are not mapped for these zones yet, so the façades show the plain imported colours.
The courtyard ground (#2280) is not exported either, so the garage deck shows through.

| Web | Unreal |
|---|---|
| ![Web: START](web-start.jpg) | ![Unreal: START](unreal-start.jpg) |
| ![Web: courtyard](web-courtyard.jpg) | ![Unreal: courtyard](unreal-courtyard.jpg) |

START: Hus L's street façade with the round stair drum, the loftgång and its rail, the neighbours' doors, windows,
lamps, downpipes and entrance plants sit as on the web, with L1007's door in the middle. The street in front is
build_l1007.py's provisional slab (the hedges are vegetation, #2281). Courtyard: Hus A's loggias (left), Hus B, Hus C
ahead and Hus L's courtyard façade with the neighbours' patios and roof terraces (right) sit as on the web.

With Nanite on, the same START capture draws the simplified fallback:
[unreal-start-nanite-fallback.jpg](unreal-start-nanite-fallback.jpg).

## World map, collision and route (2026-11-21, `L_Lunden` recomposed)

`world-levels.json` gained the three zone levels and `Generated/ExteriorWorld/Level_exterior_collision`. With the LFS
lock on `L_Lunden.umap`: `compose_world.py` saved the six sub-levels (sha256 `71a0c97420c45c3c`), a second run logged
`unchanged, nothing saved` with the same hash, and `--check` passed.

`build_exterior.py`: `373 collision actors from 283 mesh copies (stairwells and garage), door leaf left open (6 parts)`,
2 provisional ground boxes (Hus L's stairwell 44, Hus A/B/C's stairwells and the garage 329). A second run skipped
(`unchanged since import fingerprints …`).

[`exterior-route-result.json`](exterior-route-result.json): `test_exterior_route.py` in Play In Editor (Automation:
1 passed, 0 warnings). Capsule centre (cm), 94.65 cm above the floor walked on:

| Checkpoint | Capsule centre |
|---|---|
| START | (287.5, −1200, 94.65) |
| street by the portik | (−1446.8, −300.0, 94.65) |
| in the portik | (−1450.0, 893.2, 94.65) |
| through the stairwell door | (−1636.4, 896.9, 94.95) |
| landing, våning 1 | (−1726.7, 861.3, 94.65) |
| street-end floor, våning 1 | (−1730.0, 283.0, 94.65) |
| down the flight | z 59.4 → −28.9 → −117.1 |
| foot of the flight, våning −1 | (−1845.0, 796.9, −205.05) |
| through the basement opening | (−1603.6, 840.0, −205.05) |
| garage under Hus L | (−1453.3, 840.0, −205.05) |

The garage floor is at −299.7 cm (GARAGE.floor −3 m). Hus A/B/C's stairwells and the rest of the garage have the same
collision but are not on the walked route: from the street, the garage is reached through Hus L's stairwell.

START from the composed map (no level streamed in memory; Nanite off in memory as above, [`unreal-capture-composed.json`](unreal-capture-composed.json)):

![Unreal: START on the composed L_Lunden](unreal-start-composed.jpg)
