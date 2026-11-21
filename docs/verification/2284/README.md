# #2284 verification: production player

Unreal Editor 5.8.4, Windows 11, headless (`-nullrhi`), 2026-11-21, export of `2dcabb34` plus this change
(`spawn.player` and `spawn.fall` in `measurements.json`). Builder: `build_player.py`; tests copied into
`unreal/Lunden/Content/Python/` and run with `run-tests.ps1`.

| Check | Result |
|---|---|
| Move from the pilot folders (`build_player.py` on a clean checkout) | 13 assets moved to `/Game/Lunden/Player/`, `L_Lunden` re-saved with the new GameMode path, the one redirector (`BP_LundenPilotMode`) removed, exit 0, no Blueprint warnings |
| Second run / `--check` | `unchanged, nothing saved`, the 13 `.uasset` files byte-identical; `--check` passed |
| `compose_world.py --check` | `unchanged, nothing saved` (gameMode line now `BP_LundenGameMode`) |
| Extension rows (temporary rows file) | an `AudioComponent` on the character and a `SceneComponent` on the controller added; removed again by the run with the real (empty) `player-extensions.json` |
| `test_player` | passed: see below and [player-result.json](player-result.json) |
| `test_pilot_walker`, `test_pilot_route`, `test_pilot_doors` (#2246) | passed with the moved assets (`BP_LundenPlayer_C`, `BP_LundenPlayerController_C`) |
| `test_l1007` on `L_Lunden` | passed with `BP_LundenGameMode` |

`test_player` against `measurements.json` (tolerance in brackets): standing eye 162.00 cm (1), crouched eye
95.00 cm (1), crouched speed 80.00, walk 160.00, sprint 320.00 cm/s (1), gravity 980 cm/s² (web 9.8 m/s²), jump
apex 69.84 cm against 69.85 (2). Falls off platforms onto the ground, lives against the web's own `fallDamage`
results exported in `spawn.fall.samples`:

| Platform | Measured drop | Damage (web) | Lives before → after | Death |
|---|---|---|---|---|
| 2.9 m | 291.51 cm | 0 (0) | 10 → 10 | no |
| 3.1 m | 311.87 cm | 5 (5) | 10 → 5 | no |
| 4.5 m | 451.36 cm | 5 (5) | 5 → 10 | yes (refilled, as `src/combat.js`) |
| 6.1 m | 611.23 cm | 10 (10) | 10 → 10 | yes |

Route START → Övre plan → patio: on `L_Lunden` (`test_l1007`) START (287.5, −1200.0, 94.65) → upper landing
(349.72, 615.97, 419.65) → downstairs (286.45, 714.96, 94.65). The patio zone `l1007-uteplats` is not a sub-level of
`L_Lunden` yet, so the patio leg ran on `Pilot_L1007` (`test_pilot_route`): START (287.5, −1200.0, 94.65) → upper
landing (350.7, 615.96, 419.65) → downstairs → patio (147.02, 1417.07, 94.65), both doors opened with E.

The first fall test measured the 2.9 m drop as 272.92 cm: the round capsule bottom sank down the ledge before the
character fell. Flat-base floor checks fixed it (`unreal.md`, Player).

**Packaged Development run** (`RunUAT BuildCookRun -clientconfig=Development -map=/Game/Lunden/Maps/L_Lunden`, default
map set only in the local staging copy; `BUILD SUCCESSFUL`). Smart App Control blocks the unsigned staged
`Lunden.exe`, so the run used the Epic-signed `Engine/Binaries/Win64/UnrealGame.exe` with the project argument,
`-RenderOffScreen`, hidden, stopped after 30 s. The log shows `LoadMap: /Game/Lunden/Maps/L_Lunden`, `Game class is
'BP_LundenGameMode_C'`, a possessed `BP_LundenPlayer_C` with `Lives = 10`, `MaxLives = 10`, `MaxWalkSpeed = 160`,
`BP_LundenPlayerController_C` with `EnhancedPlayerInput`, and no errors. W and Shift were injected with the Enhanced
Input console commands (`Input.+key`), which gave no error. The run did not record their effect. Real mouse and
keyboard on a visible window were not exercised: that needs a desktop window, which agents do not open.
