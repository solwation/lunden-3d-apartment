# #2315 verification: the pilot doors keep their hinge

The fix is `0a8f9263`: `build_pilot_doors.py` sets both position targets of `BP_LundenSwingDoor` to the exported hinge.
It has now been checked on Windows (UE 5.8.4, headless) in a warm checkout at `9f662b65`. That checkout uses the
`BP_LundenSwingDoor` rebuilt in `e55a2540` and the export of `1ae9b74b` (door data unchanged since).

- `build_pilot_doors.py <measurements.json>`: `LUNDEN_PILOT_DOORS_OK 10 hinges in /Game/Lunden/Generated/PilotDoors/Level_l1007_doors`.
- `run-tests.ps1 -Filter Editor.Python.Lunden.test_pilot_doors`: `passed 1 (with warnings 0), failed 0`,
  `LUNDEN_PILOT_DOOR_PLAY_OK`.

The entrance `door_l0_x80_z0` stays on its hinge `(80.47, 0, 0)` cm through the whole play test, so it no longer jumps
to the origin. The numbers below come from [`pilot-doors-result.json`](pilot-doors-result.json):

| Step | Yaw | Collider (cm) | Visible panel (cm) |
|---|---|---|---|
| E out of reach, closed | 0° | (130.665, 0, 105) | (130.665, 0, 190.2) |
| E in reach, swinging | −23.439° | (126.523, −19.966, 105) | (126.523, −19.966, 190.2) |
| open | −90° | (80.47, −50.195, 105) | (80.47, −50.195, 190.2) |
| left click, closed again | 0° | (130.665, 0, 105) | (130.665, 0, 190.2) |

The collider and the visible panel move together and return to their starting positions.
