# First-person pilot controls

*Since #2284 these assets are the production player in `/Game/Lunden/Player/` (`BP_LundenPlayer`,
`BP_LundenGameMode`, `BP_LundenPlayerController`, `Input/`), built by `build_player.py`; see
[unreal.md](../../development/unreal.md#player-2284). The results below are the pilot's.*

`BP_LundenPilotMode` spawns `BP_LundenWalker` at the map's PlayerStart. Its player
controller is `BP_LundenDoorController`. The pilot character registers its Enhanced
Input mapping when play begins and removes it when play ends. WASD moves, the
mouse looks, Shift sprints, Ctrl crouches and Space jumps. The standing and
crouched eye heights are 162 and 95 cm above the floor. The character uses a
22 cm capsule radius and a maximum step height of 45 cm.

## Movement and collision in Play In Editor

The [automation test](../../../tools/unreal-engine/tests/test_pilot_walker.py)
spawns the production GameMode in a temporary level. It drives the keyboard and
mouse through Unreal's input commands. The level has a floor, one 20.3125 cm
step (the web stair's 325 cm rise divided by 16), and a blocking wall. The test
checks possession, displacement and eye height in the running game.

Epic Unreal Editor 5.8.4 on Windows 11 reported one passing test, zero warnings,
zero errors and exit code 0 on 2026-11-21. The possessed controller was
`BP_LundenDoorController_C`. The character travelled 113.07 cm in 0.75 s from
rest and stepped up 20.08 cm. At a sprint setting of 320 cm/s the centre stopped
at x = 267.90 cm against the wall at x = 290 cm and stayed there. After releasing
W and Shift, the crouched and standing eyes measured 95.00 and 162.00 cm. The
jump raised the centre by 46.30 cm within 0.16 s. The same run exercised S, A, D
and both mouse axes.

To reproduce on Windows, use a private checkout with the Unreal LFS assets.
Run this PowerShell from its repository root. `$env:UE_ROOT` points to the
installed Epic engine, for example `C:\Program Files\Epic Games\UE_5.8`.

```powershell
$editor = Join-Path $env:UE_ROOT 'Engine\Binaries\Win64\UnrealEditor-Cmd.exe'
$project = (Resolve-Path 'unreal\Lunden\Lunden.uproject').Path
Copy-Item tools\unreal-engine\tests\test_pilot_walker.py unreal\Lunden\Content\Python
$report = Join-Path $env:TEMP ('lunden-walker-' + [guid]::NewGuid())
& $editor $project -EnablePlugins=PythonAutomationTest -unattended -nullrhi -nosound -nop4 `
  '-ExecCmds=Automation RunTests Editor.Python.Lunden.test_pilot_walker; Quit' `
  '-TestExit=Automation Test Queue Empty' "-ReportExportPath=$report"
Get-Content (Join-Path $report 'index.json') -Raw
```

The pilot's generator, `build_pilot_player.py`, is replaced by
[build_player.py](../../../tools/unreal-engine/python/build_player.py) (#2284). It builds
the same assets from the export in `/Game/Lunden/Player/` and binds the GameMode to the
controller that carries the pilot door use.

The [full traversal](route.md) exercises the production character on the actual
streamed apartment and patio with both doors, the hall wall and the complete
staircase.
