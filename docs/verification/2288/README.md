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
