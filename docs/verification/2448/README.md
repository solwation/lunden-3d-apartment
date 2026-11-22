# #2448: the garage box's retaining walls are brick in Unreal

**Cause.** `src/surroundings.js` `boxWalls()` builds the box's retaining walls facing into the box (south edge −z,
west +x, east −x) and the web draws them `DoubleSide`; the export keeps that as GLB `doubleSided` (key
`std_ffffff_r95_m0_tex_ds`, mesh `kvarteret/mesh_l0_xm2851_z2627_ym144`, one mesh for every box wall). The
`material-map.json` rule swaps Interchange's double-sided instance for the hand-made `MI_LundenBrickHistoric`, which
was single-sided. From the park the wall's back face was culled and the terrain's own grass step 4 cm behind it showed
(the vertical green stripes).

**Fix.** `"twoSided": true` on `MI_LundenBrickHistoric` (`build_materials.py` already sets the instance's two-sided
override from it, #2395). The new check 10 in `tests/test_materials.py` found three more rules with the same shared
cause, now two-sided too: Hus L's brick (`MI_LundenFacadeBrick`, key `std_ffffff_r100_m0_tex_ds`), the Å-husen's hip
roofs (`MI_LundenRoofFeltAHus`) and the old S:t Lars roofs (`MI_LundenRoofSeam`). The four instances are rebuilt.

## Checks

| Check | Result |
|---|---|
| `python3 tools/unreal-engine/tests/test_materials.py <export>` with main's `material-map.json` (exports of 33c6c991 and, after rebasing on #2433, ff9342f1) | **fails**: 29 double-sided key/mesh pairs under rules, 4 on a single-sided material (the four above) |
| the same with this change | **passes** (`MATERIAL_COVERAGE_OK`, 29 pairs, each on a two-sided material) |
| `build_materials.py --check` (Windows checkout, after the rebuild) | `LUNDEN_MATERIALS_CHECK_OK` (spec hash and two-sided override per entry) |
| `sync-import.ps1 -ExportFrom <export of 33c6c991>` | `LUNDEN_SYNC_IMPORT_OK`, import current, `import_world.py --check` OK |

## Pictures

1440 × 810, 21 June 14:00, clear. Web: `tools/unreal-engine/capture-web-views.cjs` with [`web-views.json`](web-views.json).
Unreal: `tests/capture_vegetation.py` on `L_Lunden` with [`unreal-scene.json`](unreal-scene.json)
([`unreal-capture.json`](unreal-capture.json)). Pairs: web left, Unreal right.

- [`pair-retaining-wall.jpg`](pair-retaining-wall.jpg): the wall south of Hus C (z 52.5) from the park (the issue's view).
- [`pair-box-wall-b.jpg`](pair-box-wall-b.jpg): the wall between Hus B and Hus A (z 33.3) with its three windows.
- [`pair-box-wall-west.jpg`](pair-box-wall-west.jpg): the west wall (x −70.5) from Karpvägen, beside the garage door.

The box's east edge (x −41.7, z 33.3…52.5) runs along Hus B's storage rooms, so it has no free view; it is part of the
same mesh and material as the walls above.

## Remaining differences (each with an open issue)

- The garage windows show plain glass in Unreal; the web draws rooms with blinds behind them: #2456.
- Hus C's plain lower façade along Karpvägen is browner in Unreal than the web’s rust red: #2458.
- The park bush in front of the z 33.3 wall is darker and more see-through in Unreal: #2449.
- Lawn and crowns are a little paler in Unreal: #2437. Brick tone at a distance: #2428. Glass reflects the sky: #2424.
- Karpvägen's asphalt has no cracks or broad tone in Unreal: documented in `MI_LundenAsphalt`'s assumption (#2318).
