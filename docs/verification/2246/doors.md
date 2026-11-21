# L1007 pilot doors

The content-only pilot uses `BP_LundenSwingDoor` to animate the original imported
leaf, glass and fittings about each web hinge. The imported frame and jamb strike
stay fixed. A movable box covering the leaf blocks the walking capsule and
visibility traces throughout its swing. `BP_LundenDoorController` (since #2284
`/Game/Lunden/Player/BP_LundenPlayerController`) traces 220 cm
from the active camera on E or left mouse press and toggles the first door hit.
Its eased rotation takes approximately 0.56 seconds, matching `src/doors.js`.

Run the following in an isolated pilot project with the exported measurements
and the importer's `/Game/Lunden/Generated/l1007/Level_l1007` available.

1. Build the derived door sublevel with the installed Epic editor. Supply the
   absolute path to the export's `measurements.json` as the script argument.

   ```powershell
   .\tools\unreal-engine\run-python.ps1 tools/unreal-engine/python/build_pilot_doors.py "C:/build/Lunden/Import/measurements.json"
   ```

2. Build the player with `build_player.py` (#2284). Its `BP_LundenGameMode` uses
   `/Game/Lunden/Player/BP_LundenPlayerController`, the pilot's `BP_LundenDoorController`
   moved there with its door use. Compose the pilot
   with `/Game/Lunden/Generated/PilotDoors/Level_l1007_doors` in place of the
   static L1007 import. The composition retains the original patio sublevel.
3. To run the input and geometry check, copy `tools/unreal-engine/tests/test_pilot_doors.py`
   into the scratch project's `Content/Python`, then run
   `tools/unreal-engine/run-tests.ps1 -Filter Editor.Python.Lunden.test_pilot_doors`.
   It loads the derived map, starts Play In Editor and operates the entrance
   with the pilot controller. It writes the observed hinge, collider and visible
   panel positions to `Saved/pilot-doors-result.json`.

The two Blueprint packages are in Git LFS. The derived sublevel is reproducible
from the generated import and uses its original mesh packages. The builder
saves its work to the separate PilotDoors map and checks the placed hinges
against the export before attaching the moving parts.

On 2026-11-21 the stock Epic 5.8.4 editor ran one PIE automation test with
zero warnings or failures. At 305 cm, E left the entrance closed. At 100 cm
E opened it from 0° through −24.614° to −90°. A left click from the side
closed it. The hinge stayed at (80.47, 0, 0) cm. The visible imported panel
and blocking box each returned to their initial position. The original
l1007 map still matched its import stamp after two builds of the derived map.
[Recorded PIE measurements](door-interaction.json)
