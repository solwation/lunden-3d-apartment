# #2288 — the save file (Unreal)

UE 5.8.4, 2026-11-21, conductor session `orkester: solwation-w11-opus-5.5-20261121`. Design and commands:
[unreal.md "Save file (#2288)"](../../development/unreal.md#save-file-2288). Non-visual work: no result images.

## Play In Editor (`tests/test_save.py`, passed)

Run with `test_player` and `test_fixture_material` in one `run-tests.ps1 -Filter Editor.Python.Lunden.test_` call:
3 passed, 0 failed, editor exit 0. Output: [save-result.json](save-result.json).

| Check | Result |
| --- | --- |
| Migration: the frozen `tests/save-v0.sav` (2,494 bytes; stores neither `SaveVersion` nor `PlayerId`) in the slot, then `BFL_LundenSave.LoadSave` | reads as version 0; comes back as version 1 with name, look code, map, location and facing unchanged (0.000 cm, 0.000°) and a new id `54dbac5e-46ef-46f8-1ab0-dbb58c0f96d8` (8-4-4-4-12 lower-case hex); the file on disk is rewritten at version 1 with that id; a second load returns the same id and leaves the file byte-identical |
| First start from an empty slot (PIE session 1) | `BP_LundenPlayerController` carries one `BPC_LundenSave`; the save is created with a new web-shaped id |
| Settings, name, look code through the library | four `SetSetting` keys, `SetPlayerName`, `SetLookCode` all report success |
| Place in the file, read without the game | the player moved to (1234.5, −678.9) facing pitch −12.6°, yaw 137.3° and ended session 1 at z 94.65; the slot (2,872 bytes, version 1) holds that place and facing with 0.000 cm and 0.000° error |
| Restart (PIE session 2; only the file carries state) | the player spawned at the PlayerStart 3,493.9 cm away and was put back at (1234.5, −678.9, 94.65), facing (−12.6°, 137.3°): **0.000 cm, 0.000°** (limit 1 cm, 1°) |
| Settings, name, look, id after the restart | all four settings equal (`Found` true), an unknown key returns its default (`Found` false), name, look code and id unchanged |
| Save from another map | `RestorePlace` returns false and the player does not move |

Also: `build_save.py` second run `unchanged, nothing saved` (all three `.uasset` SHA-256 unchanged), `--check` passed;
a rebuild over the existing assets compiles without errors; `build_player.py` added `controller.Save` (2 extension
rows) and its `--check` passed; `test_player` passed after that rebuild.

## Packaged Shipping game (real process restart)

A Win64 Shipping cook of this commit's assets with a temporary flat level (`make_pack_map.py`: ground, PlayerStart,
`BP_LundenGameMode`) as `GameDefaultMap` ([cook.ps1](cook.ps1); BuildCookRun 31.6 s, under `C:\LundenBuilds\opus-2288`,
deleted afterwards). The archived `UnrealGame-Win64-Shipping.exe` is the stock runtime the launcher installs
(SHA-256 `e083ad2f…95953`). Every start ran headless (`-nullrhi -nosound -unattended`) on a never-shown desktop
(`run-hidden.ps1` from [#2249](../2249/run-hidden.ps1)) with `-UserDir=C:\LundenBuilds\opus-2288\userdir`, the
same switch the launcher passes, and was stopped by PID after 20 s ([pack-run.ps1](pack-run.ps1)).

| Step | Result |
| --- | --- |
| 1. First start, empty user dir | the game wrote `<UserDir>\Saved\SaveGames\LundenSave.sav` (2,232 bytes): `SG_LundenSave`, version 1, a new id `288475d1-447b-46f9-aafc-85a3635e2eda`, map `L_SaveTest`, place = the PlayerStart standing (−2000, −2000, 94.65); no `.sav` anywhere under the archive (installation) tree |
| 2. Edit in the editor ([pack_check.py](pack_check.py) `edit`) | place (777.7, 888.8, 94.65), facing pitch −20°, yaw −45°, a setting `pack.check = 2288`, name `Paketprov` |
| 3. Second start (new process) | the game rewrote the file (2,510 bytes, new hash `e17472db…`) |
| 4. Read back (`pack_check.py verify`) | place **0.0000 cm** and facing **0.0000°** from the edited values, so the game put the player there at start and its autosave stored that place; setting, name and id kept |

Shipping ignores a map given on the command line (`UE_ALLOW_MAP_OVERRIDE_IN_SHIPPING`), so the first attempt, which
passed the map as an argument, loaded the empty default map and wrote no save; a Development cook with the same
argument loaded the level with `BP_LundenGameMode` and wrote the slot, and the Shipping run above sets the map through
`GameDefaultMap`. The release build sets its own default map (#2246/#2278); the save needs nothing more than
`BP_LundenGameMode`.

## Update and uninstall through the signed launcher (test channel)

[launcher-steps.ps1](launcher-steps.ps1), the #2249 procedure without the proxy: the signed
`Lunden-Setup-0.1.1-win-x64.exe` (SHA-256 `e6477a6a…`, Authenticode Valid, Svep Design Center AB), test channel only
(`%LOCALAPPDATA%\Programs\Lunden-Test`, user data `%LOCALAPPDATA%\Lunden-Test`; neither existed before, the stable
installation was not touched), hidden desktop, each game stopped by PID. No release or tag was created.

| Step | Result |
| --- | --- |
| `--install --quiet --channel test` | exit 0 |
| First start (latest = `v0.1.1`) | active 0.1.1 / content 1 (manifest `A10ADA40…`), game started |
| Seed: the save the packaged game wrote in step 3 above, into `%LOCALAPPDATA%\Lunden-Test\Saved\SaveGames\LundenSave.sav` | SHA-256 `e17472db2bf83b6f0faca31c12b197330465aab18fa31f5e652df0a1178c4e5f` |
| Start with the `app-v0.1.2` test manifest | `Kontrollerar Lunden 0.1.2, innehåll 2.` → `Hämtar Lunden/Content/Paks/Lunden-Windows.pak` → `Hämtat: 11226745 byte.`; active 0.1.2 / 2, previous 0.1.1 / 1; the game started from the new version |
| Save after the update | **unchanged** (`e17472db…`) |
| `Lunden-Setup-0.1.1-win-x64.exe --uninstall --quiet --channel test` | program directory and HKCU entry removed; save **unchanged** (`e17472db…`); the throwaway `Lunden-Test` user data was then deleted |

What this does and does not cover: the save the launcher kept is a real `SG_LundenSave` file written by the Shipping
game, in the folder the launcher's `-UserDir` gives the game, across a real signed app/content update and a default
uninstall. The installed 0.1.1 and 0.1.2 games predate this commit, so the game that ran after the update did not read
the file; reading it after a restart is the packaged check above, with the same executable and the same `-UserDir`
mechanism. An update that installs a build containing `/Game/Lunden/Save` through the launcher needs the next release
with this content (#2248/#2250 chain).
