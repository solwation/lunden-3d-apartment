# Packaged L1007 pilot performance

The game renders offscreen on the real GPU. Windows Python launches it with its console hidden. The test leaves the desktop available while it records frames. See [background verification on this PC](../../development/unreal.md#no-windows-on-the-users-desktop-user-2026-11-21).

The benchmark uses Epic's stock UnrealGame.exe in a Windows Development archive of the composed L1007 and patio. The route runs in the game with a 90° horizontal camera. Its Level Sequence follows the positions and rotations of the five references in order and closes the loop back to START. Each segment takes three seconds. The renderer uses the pilot's daytime lighting throughout. The moving camera can pass through walls and floors. Player collision, doors and staircase traversal have their own gameplay tests.

## Measurements on 21 November 2026

Windows 11, Intel Core i9-10900K, 32 GB RAM, NVIDIA GeForce RTX 3080. All four passes used Direct3D 12, Lumen GI and reflections, and virtual shadow maps. They used the final playable map sources with the corrected materials, doors, ground and stair collision. The editor commandlet made a separate copy of that map for its camera. Each packaged Development process completed 6,600 frames and exited with code 0. The Windows Shipping zip was started separately.

| Resolution | Quality | Frames | Mean FPS | 1% low FPS | Mean frame ms | P99 ms | Game thread ms | Render thread ms | GPU ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1920 × 1080 | High | 1306 | 87.04 | 69.35 | 11.49 | 13.71 | 2.96 | 11.49 | 5.97 |
| 1920 × 1080 | Epic | 1852 | 123.43 | 93.30 | 8.10 | 10.09 | 1.85 | 8.10 | 7.60 |
| 2560 × 1440 | High | 1717 | 114.46 | 87.23 | 8.74 | 11.01 | 1.92 | 8.74 | 8.23 |
| 2560 × 1440 | Epic | 1268 | 84.51 | 61.50 | 11.83 | 14.66 | 1.92 | 11.83 | 11.38 |

[Machine-readable results](performance.json).

## Reproduction on Windows

1. Follow the [playable pilot build](../../development/unreal.md#local-playable-l1007-pilot-2246) through `prepare_playable_pilot.py`. Keep its game mode, room and patio imports, derived doors, collision geometry and `pilot-scene.json` in the build workspace.
2. In a disposable copy of that project, run the installed UnrealEditor-Cmd with `-run=pythonscript`, `-nullrhi`, and `-script=".../prepare_profile_camera.py .../pilot-scene.json"`. It creates the profiling map and sequence under `/Game/Lunden/Tests`.
3. Use the engine's `RunUAT.bat BuildCookRun` with the result's `-project=...`, `-map=/Game/Lunden/Tests/ProfilePilot -platform=Win64 -clientconfig=Development -nocompileuat -nocompile -skipbuild -cook -stage -pak -iostore -package -nodebuginfo -nobootstrapexe -archive -unattended` and a private `-archivedirectory=...`. Pass `"-AdditionalCookerOptions=-NullRHI -NoSplash -NoLogWindow -NoDialog"` to the cook. For unattended runs on the shared PC use a hidden process host for UAT as well.
4. Run `python tools/unreal-engine/profile_game.py <archive>/Windows <output directory on Windows>`. Each pass receives its own Saved directory, CSV, game log and JSON summary. The script checks the recorded output resolution, scalability groups, Lumen passes, map sequence and Windows build type. It requests 100% screen percentage with dynamic resolution and vsync disabled. An abnormally fast host may need a larger `--frames` value for two complete laps.

## Reading the measurements

The CSV records frame, game thread, render thread and GPU times for every frame. Sampling begins after all four counters have produced valid timings and one 15-second warm-up lap has passed. The table covers the next complete lap. Mean FPS is 1000 divided by the mean frame time in milliseconds. The 1% low is 1000 divided by the mean of the slowest 1% of sampled frames, rounded up to a whole frame. P99 is the nearest-rank 99th percentile frame time. All four runs use in-thread CSV processing (`-csvNoProcessingThread`), so the frame timings include that overhead. With UE 5.8.4's default asynchronous CSV thread the logger wrote a complete capture, but the Development process returned a nonzero exit code at shutdown.
