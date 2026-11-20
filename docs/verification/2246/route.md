# Walking through the L1007 pilot

The pilot starts outside L1007. Walk to the front door, face it and press **E**.
Enter the hall and turn right through the opening into the kitchen. Follow the
hall south to the staircase, then turn left onto the first flight. Follow its
turn to the upper landing. Back downstairs, continue through the living room to
the glazed door and press **E** to reach the patio.

In the [recorded traversal](route-result.json), Unreal Editor 5.8.4 reported
one success, zero warnings, zero errors and exit code 0. E swung the north door
to −90° and the patio door to +90°. The character centre stopped at x = 183.56 cm
against the hall wall at x = 205.66 cm, leaving the normal 22.10 cm capsule
clearance. The centre rose from 94.65 to 419.62 cm at the upper landing and
returned to 94.65 cm downstairs. The character finished on the patio at
(147.02, 1417.13, 94.65) cm.

## Collision in the imported map

On the initial Play In Editor run, the player fell to z = −906.93 cm at START.
After adding a forecourt, the player could reach the entrance but fell through
the hall floor. The streamed apartment and patio were both visible and all ten
door hinges were present. The shared imported collision mesh reported
`BlockAll` with an empty set of simple shapes when reopened. Its 54 correctly
positioned wall and floor actors therefore provided no blocking geometry for
the player. The 15 visible stair meshes also lacked simple shapes.

The [collision builder](../../../tools/unreal-engine/python/build_pilot_collision.py)
places collidable boxes at the imported proxy bounds, preserving the upper stair
opening. On the stairs, the capsules collide with the triangles of the actual
treads, including the eight winders. The unchanged source meshes remain visible.
The patio support follows the paving in `data/plan.json`. The visible front
ground covers the apartment's frontage, with the asphalt and planting strip at
the depths in `SITE.roads` and `SITE.life.strip` and project materials reused
from the patio. The surrounding street and adjacent properties are outside the
two imported zones.

## Reproduce on Windows

Use a private Unreal 5.8.4 project containing the imported apartment and patio,
the [pilot player](player.md), the interactive apartment sublevel and their
composed `/Game/Lunden/Maps/Pilot_L1007`. After composition, run the collision
builder with the installed Epic editor. It writes the map and fifteen derived
static meshes under `/Game/Lunden/Generated/PilotCollision`. Build from fresh
derived content after replacing the original imported geometry.

From the repository root with `UE_ROOT` set to the installed engine directory,
run the following in PowerShell.

```powershell
$editor = Join-Path $env:UE_ROOT 'Engine\Binaries\Win64\UnrealEditor-Cmd.exe'
$project = (Resolve-Path 'unreal\Lunden\Lunden.uproject').Path
$builder = (Resolve-Path 'tools\unreal-engine\python\build_pilot_collision.py').Path
$flags = @(('"{0}"' -f $project), '-unattended', '-NullRHI', '-RenderOffscreen', '-nosplash', '-nosound', '-nop4')
$author = $flags + @('-run=pythonscript', ('-script="{0}"' -f $builder))
$result = Start-Process $editor -ArgumentList $author -WindowStyle Hidden -Wait -PassThru
if ($result.ExitCode -ne 0) { throw 'Pilot collision build failed' }
Copy-Item tools\unreal-engine\tests\test_pilot_route.py unreal\Lunden\Content\Python
$report = Join-Path $env:TEMP ('lunden-route-' + [guid]::NewGuid())
$test = $flags + @('-EnablePlugins=PythonAutomationTest',
    '-ExecCmds="Automation RunTests Editor.Python.Lunden.test_pilot_route; Quit"',
    '-TestExit="Automation Test Queue Empty"', ('-ReportExportPath="{0}"' -f $report))
$result = Start-Process $editor -ArgumentList $test -WindowStyle Hidden -Wait -PassThru
if ($result.ExitCode -ne 0) { throw "Pilot traversal failed. See $report" }
```

The [route test](../../../tools/unreal-engine/tests/test_pilot_route.py) uses the
production character, GameMode and door controller in the actual streamed map.
It steers the player's view and presses W and E through Unreal input. All body
movement comes from the character's movement and collision system.
