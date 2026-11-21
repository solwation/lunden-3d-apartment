# #2318 verification: brick, roofs, asphalt and paving in Unreal

Unreal Editor 5.8.4 on Windows 11, 2026-11-21. The export is from `7e3faf58` plus this change. Every GLB is
byte-identical to the export before (SHA-256 of all nine zone files unchanged); only `measurements.json` gained
`materials[].looks`. Everything ran headless (`-nullrhi`, or `-RenderOffScreen` for the pictures). How it works:
[unreal.md, Patterned surfaces](../../development/unreal.md#surface-materials-2282).

## Why the façades were white

Hus L's brick is `MeshStandardMaterial({ map: brickTexture(), … })`: white times a canvas. The export key
`std_ffffff_r100_m0_tex_ds` leaves the canvas out, so Interchange's instance kept the white. Hus A/B/C, the courtyard's
retaining walls and the felt roofs went the same way. The site's asphalt shares the key `std_ffffff_r100_m0_tex` with the
hall and wet-room tiles, so it reached the last tile rule and was drawn as white wall tiles. `MI_LundenFacadeBrick`
(#2282) existed, but no rule used it, and `test_materials.py` accepted the fallback.

## The check now fails on a fallback

The export lists every web material behind a key (`looks`): the web's own surface class (the weather layers' tag:
`wetSurface`, `wetGround`, `snowGround`), the colour map's name and its first-use order (`mapIndex`), and for a shared
key the nodes showing each look. `test_materials.py` derives the brick, roof, asphalt and paving looks from that data
alone and requires each mesh showing one to reach a material whose `surface` names the same class.

Before the rules (this export, `material-map.json` of `7e3faf58`): 19 errors, for example

```text
ERROR: brick look of key std_ffffff_r100_m0_tex_ds on hus-l/mesh_l0_xm1668_z455_y665 reaches the import default (draws no brick)
ERROR: asphalt look of key std_ffffff_r100_m0_tex on l1007-entre/mesh_site-asphalt_l0_x288_zm875_y1 reaches MI_LundenTileWall (draws no asphalt)
ERROR: roof look of key std_8b9095_r90_m0_tex_ds on kvarteret/mesh_l1_xm3059_z3497_y1307 reaches the import default (draws no roof)
```

After:

```text
patterned surfaces (#2318): brick 4 mesh(es), roof 3 mesh(es), asphalt 4 mesh(es), paving 8 mesh(es) from 15 look(s); each on a material that draws its surface
MATERIAL_COVERAGE_OK
```

An export without `looks` fails too (`the export predates #2318, export again`).

## Unreal

- `build_materials.py`: 8 instances created (`MI_LundenFacadeBrickAHus`, `MI_LundenBrickHistoric`, `MI_LundenAsphaltPatch`,
  `MI_LundenRoofFeltHusL`, `MI_LundenRoofFeltAHus`, `MI_LundenStreetPaving`, `MI_LundenCourtBrickPaving`,
  `MI_LundenCobbles`), 4 updated (`MI_LundenFacadeBrick`, `MI_LundenAsphalt`, `MI_LundenRoofSeam`, and
  `MI_LundenPatioPaving`, which only gained its `surface` tag), 20 kept: `LUNDEN_MATERIALS_OK 12 written, 20 kept`.
  `--check`: `LUNDEN_MATERIALS_CHECK_OK 32 materials`.
- `sync-import.ps1` (all nine zones imported again, because the material map changed; every derived build; compose and
  import checks): `LUNDEN_SYNC_IMPORT_OK`, `LUNDEN_CHECK_OK`. Material slots mapped per zone: hus-l 839, l1007 494,
  omgivning 17, gard 8, kvarteret 3, l1007-uteplats 3, l1007-entre 2.

## Houses checked

| House | Brick | Roof | Result |
|---|---|---|---|
| Hus L | `std_ffffff_r100_m0_tex_ds`: façades, drums, gables, loft, reveals (one node) | `std_616870_r90_m0_tex` felt | affected, fixed |
| Hus A, B, C | `std_ffffff_r95_m0_tex`: the Å-husen's bodies, piers and parapets (one node for all three) | `std_8b9095_r90_m0_tex_ds` felt | affected, fixed |
| Hus L pilasters | `std_8a3b2a_r95_m0`: plain brick colour on the web too | | not affected (no canvas) |
| Courtyard retaining walls, school wall | `std_ffffff_r95_m0_tex_ds`, school wall by mesh | | affected, fixed |
| Old S:t Lars buildings | painted window-grid tile, no surface class | `std_43494e_r70_m15_tex_ds` standing seam | roof fixed; façade left (see below) |

## Pictures

1440 × 810, 72° vertical, 21 June 14:00, clear. Web: the desktop Ultra scene (`capture-web-views.cjs`), reused unchanged
from [#2281](../2281/README.md) (START), [#2308](../2308/README.md) (courtyard) and [#2289](../2289/README.md)
(patio): no web source changed since. Unreal: `tests/capture_vegetation.py` on the composed `L_Lunden`, lit by its own
sky (no temporary light); START and the patio are the shared `views.json` cameras, the courtyard is #2281's camera
([`unreal-capture.json`](unreal-capture.json)).

| Web | Unreal |
|---|---|
| ![Web: START](web-start.jpg) | ![Unreal: START](unreal-start.jpg) |
| ![Web: courtyard](web-courtyard.jpg) | ![Unreal: courtyard](unreal-courtyard.jpg) |
| ![Web: patio](web-patio.jpg) | ![Unreal: patio](unreal-patio.jpg) |

Hus L, the stair drum and Hus A now show red brick in half bond with light joints at the web's brick size, and the
street in front of START is asphalt instead of white wall tiles. The courtyard's paths show the slab joints, the brick
pavers at its far end are red.

Remaining differences, none of them this issue's:

- Hus L's courtyard façade at a grazing angle shows moiré arcs: `M_LundenTiled` draws joints without filter-width
  antialiasing, so joints thinner than a pixel alias (no open issue).
- The basketball court's lines in front of START are missing: `src/basket.js` builds them in `main.js`, outside
  `buildWorld`, like the ball (#2310 names only the ball).
- White plants (#2321), the neighbours' flat windows and the lit window panels (#2324), the missing neighbour houses
  on the left of START (#2323), the hedges' texture and Hus A's balcony slats (#2325).
- Calibration is *guess* (each entry's `assumption`): per-brick jitter as one variation, no bump relief or moss, the
  herringbone as running bond, square setts for the cobbles, no asphalt tracks or roof mottle. The old S:t Lars bays'
  painted window grid stays on Interchange's instance (it has no surface class, and plain brick would lose its windows).
