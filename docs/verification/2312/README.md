# #2312 verification: the change event of doors, windows, switches and taps

Source: `main` at 98f42f51 + this issue's change; export of the same sources (`check-export.mjs`: current), imported
with `sync-import.ps1 -ExportFrom …` (all steps OK, `compose_world.py --check` unchanged). Unreal 5.8.4 in the Windows
worktree `lunden-ue-wt/opus-2312`, headless (`-nullrhi` builders, PIE test without a window on the desktop). No
picture: the change has no visible result.

## Mechanism

`build_interaction.py` builds `/Game/Lunden/Interaction/BP_LundenInteractionListener` and makes `BP_LundenSwingDoor`'s
`Apply` call its function `OnInteractableChanged(Id, IsOpen, Source)` on every listener actor, once per real change.
Why a listener class: a Blueprint-declared dispatcher's Call node and a Blueprint interface's implementation cannot be
made headless in UE 5.8.4; see docs/development/unreal.md, "Doors, windows, switches and taps (#2285)", for the probe
results (#2312 probes 2 and 3: hub dispatcher, interface, base class + overriding child).

## Checks

- **Builder:** `build_interaction.py` (in `sync-import.ps1`) → `LUNDEN_INTERACTION_LEVEL … {"swing": 10, "sliding": 2,
  "wardrobe": 6, "sash": 6, "switch": 13, "tap": 6}`, `LUNDEN_INTERACTION_LIFTS … 49 buttons`, `LUNDEN_INTERACTION_OK`.
- **Idempotent:** a second run logs `listener unchanged, nothing saved` and `class unchanged, nothing saved`; both
  `.uasset` files are byte-identical before and after (SHA-256). `build_interaction.py --check` →
  `LUNDEN_INTERACTION_CHECK_OK spec 6c516f97a9c1` (both classes carry the script's hash, compile cleanly, one listener
  call in the door's graph).
- **PIE test on the composed `L_Lunden`:** `test_interaction` → `LUNDEN_INTERACTION_TEST_OK 18 doors, 6 sashes, 13
  switches, 6 taps, 49 lift buttons, 102 change events`, automation result passed (0 warnings). All earlier assertions
  are unchanged and pass. New: a `BP_LundenInteractionListener` placed before Play heard 102 calls for 102 changes over
  all 92 interactables, none mismatched (per id: calls = `ChangeCount`, alternating, ending on the current state); for
  open + repeated open + close the 18 doors and sashes outside the wardrobe pairs each heard exactly `[true, false]`,
  and so did the Hall switch `light_fixture_l0_x195_z48` and the kitchen tap `tap_koksblandaren_l0_x531_z208` for
  on + repeated on + off. `LastSource` is a `BP_LundenSwingDoor_C`. Every value:
  [interaction-result.json](interaction-result.json) (`event`).
