# #2302 verification: façade collision for Hus L, A, B and C

UE 5.8.4, Windows worktree, headless (`run-python.ps1` / `run-tests.ps1`, `-nullrhi`). Export of `66b1b6fb`, imported with
importer version 6, `L_Lunden` with the patio (#2289). Collision is not visible, so there are no pictures. How it works:
[unreal.md, Buildings → In the world map](../../development/unreal.md#buildings-hus-l-hus-abc-and-the-garage-2279).

## Build

`build_exterior.py` now also copies the meshes with `source` src/exterior.js (Hus L) and src/surroundings.js (Hus A/B/C):
`LUNDEN_EXTERIOR_BUILD … 522 collision actors from 376 mesh copies (stairwells, garage and façades), door leaf left open
(6 parts)`. Before #2302 it built 373 actors from 283 copies. The new copies are 149 actors and 93 meshes with about
156k triangles: Hus L 74 meshes and 109,745 triangles, A/B/C 19 meshes and 46,363 triangles, counted in the GLBs. Each
copy is complex-as-simple, double-sided, with Nanite off, hidden in game, as for the stairwells. No versioned file changed.

## Façade points (`tests/test_facades.py`, Play In Editor on `L_Lunden`, save file isolated)

For each of the export's 16 façade and gable rays, the character starts on the ground 2.5 m outside the façade and walks
towards a point 6 m inside. The "Before" column was measured with the same test before the new copies were built.
Distances are the capsule centre's position along the ray, relative to the ray's façade point. A negative value means
the character stopped outside. The value is positive under the loggias, where the ray's point is the storey-2 rail.

| House | Point | Floor (cm) | Before #2302 | After |
|---|---|---|---|---|
| L | courtyard (south) façade, storey 2 (`husl_court_facade`) | -0 | walked through | stopped -26.6 cm |
| L | east gable (`husl_east_gable`) | -40 | stopped +561 cm (inside) | stopped -24.5 cm |
| L | street (north) façade, storey 2 (`husl_street_facade`) | 1 | walked through | stopped -26.6 cm |
| L | west gable (`husl_west_gable`) | -1 | walked through | stopped -22.1 cm |
| A | east façade (`husa_east_facade`) | -301 | walked through | stopped -22.1 cm |
| A | north façade, storey 2 above the base (`husa_north_facade`) | -1 | walked through | stopped -26.8 cm |
| A | south façade (`husa_south_facade`) | -301 | walked through | stopped -30.1 cm |
| A | west façade (`husa_west_facade`) | -301 | walked through | stopped -26.9 cm |
| B | east façade (`husb_east_facade`) | -301 | walked through | stopped -26.9 cm |
| B | north façade, storey 2 above the base (`husb_north_facade`) | -1 | walked through | stopped -26.9 cm |
| B | south façade (`husb_south_facade`) | -299 | walked through | stopped -30.1 cm |
| B | west façade (`husb_west_facade`) | -1 | walked through | stopped -26.9 cm |
| C | east façade (`husc_east_facade`) | -1 | walked through | stopped -26.9 cm |
| C | north façade, storey 2 above the base (`husc_north_facade`) | -1 | walked through | stopped -26.9 cm |
| C | south façade (`husc_south_facade`) | -1 | walked through | stopped +161.9 cm |
| C | west façade (`husc_west_facade`) | -225 | stopped -12.9 cm | stopped -22.1 cm |

Result: 16/16 points stop the player, 4/4 per house (`LUNDEN_FACADES_OK 16 façade points, 2 passages`, Automation
1 passed): [`facades-result.json`](facades-result.json). Before #2302 the character got inside at 15 of 16 points (14
walked through). Only Hus C's west façade stopped it, through the garage copies along the drive.

Equivalent houses: L, A, B and C were all affected (none had façade collision), and all are fixed by the same builder
change. Hus L's visitable flats (L1004/L1201, src/world.js visitFlatParts) get no copy. The street and courtyard points
of Hus L stop at its exterior.js façade.

## Openings

| Passage | Before | After |
|---|---|---|
| Hus L's portik, street (y −300) through to the courtyard (y 1500) | passable | passable |
| the drive up to the garage door (x −76 → −70.9 m, park level) | passable | passable |

Unchanged since #2279: the garage door's leaf (garage.js) and the A/B/C entrance glazing and closed doors
(corehouse.js) block. Opening doors is #2285.

## Regression (same build, `compose_world.py --check`: `L_Lunden` unchanged, sha256 `bb2fe18270393eda`, no lock taken)

- `test_l1007`: 1 passed, `LUNDEN_L1007_WORLD_OK` (START → front door → hall → stairs and back).
- `test_exterior_route`: 1 passed, `LUNDEN_EXTERIOR_ROUTE_OK 16 checkpoints` (START → portik → stairwell → garage).
- `test_site`: 1 passed, `LUNDEN_SITE_OK 17 control points within 5.0 cm (max 3.055 cm), 23 route checkpoints`.
