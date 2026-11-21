# #2299 verification: double-sided imported collision

UE 5.8.4, Windows worktree, headless (`run-python.ps1` / `run-tests.ps1`, `-nullrhi`). Export of `66b1b6fb`, all
nine zones (`check-export.mjs`: current). No visual result, so no pictures. How it works:
[unreal.md, Import into Unreal → Collision](../../development/unreal.md#import-into-unreal-verified-2026-11-20).

## Import (importer version 6)

Every zone re-imported (`changed: importerVersion`). Each import log line now reports the meshes made double-sided:
fixture 5, gard 24, hus-l 1,122, kvarteret 262, l1007-entre 3, l1007-uteplats 41, l1007 1,944, omgivning 83,
vegetation 6 (3,490 in total), each followed by `LUNDEN_IMPORT_DOUBLE_SIDED`. The fingerprints of the zones whose
GLB did not change are the same as with version 5 (for example hus-l `84fecfa1e9214daa`, kvarteret `50aff2cf36bc6a01`),
because the fingerprint does not cover the flag. `import_world.py --check` in a new editor process: the flag is saved
on all 3,490 meshes, every fingerprint matches, `LUNDEN_CHECK_OK`.

Cost: package bytes +0.05 % (hus-l 119,771,110 → 119,833,121, l1007-uteplats 6,962,500 → 6,964,766). The import
was not slower (l1007 59 s, hus-l 23 s, with a warm DDC). The flag changes no geometry.

## Traces (`test_exterior.py`, nothing changed in memory)

The test no longer turns on double-sided collision in memory. It fails if any measured imported mesh is single-sided.
Result: **32/32** on the same node within 0.000 cm (Automation 1 passed, exit 0): [`exterior-result.json`](exterior-result.json).
This includes the rays at the glazed entrances that #2279's first run missed from behind:
`husa_entrance_glass` and `husb_entrance_glass` (y 2280 → 3190 and 2730 → 3640 cm), and `husc_entrance_glass`.

## World map (`L_Lunden` with the patio, #2289)

The derived levels were rebuilt from the version 6 import (`build_l1007.py`, `build_exterior.py`, `build_site.py`,
`build_lighting.py`, `build_interaction.py`, `build_vegetation.py`). No versioned file changed.
`compose_world.py --check`: unchanged (sha256 `bb2fe18270393eda`), nothing saved and no lock taken. In Play In Editor
with the save file isolated (#2311):

- `test_l1007`: 1 passed, `LUNDEN_L1007_WORLD_OK`.
- `test_exterior_route`: 1 passed, `LUNDEN_EXTERIOR_ROUTE_OK 16 checkpoints`.
