# #2306: capture light counts on L_Lunden and Pilot_L1007

The capture scripts (`capture_l1007.py`, `capture_exterior.py`, `capture_seasons.py`, `capture_lighting.py`) light
the editor world through `tools/unreal-engine/tests/capture_light.py` (2ec7c8c4, 82ae01c1). L_Lunden uses its own
`BP_LundenSky` and lamps. Pilot_L1007 uses the rig that `capture_pilot.py` saved on the pilot map. Neither map gets an
extra light. This README records the native check of that rule.

## Run

- UE 5.8.4 headless (`run-python.ps1`, `-unattended -nullrhi -nosplash`), 2026-11-21.
- Windows worktree at main 27be8ee5, imported from the `Unreal export` workflow artifact `unreal-export-1c833b85e6ff1552`
  through `sync-import.ps1 -ExportFrom`.
- `scene.json` from `node tools/unreal-engine/pilot-scene.mjs measurements.json scene.json`: day at 14:00 with the lamps
  off, evening at 22:00 with the lamps on, at the date in `views.json`.
- The harness called the real `light_for`, `light.use(preset)`, `light.bias(preset)` and `count_lights` from
  `capture_light.py` for both maps and both presets. `count_lights` raises on any visible, emitting directional or sky
  light that the map's own sky (or the pilot rig) does not own, and on any sky-light count other than 1.

## Light counts (visible, intensity > 0; raw output in [light-counts.json](light-counts.json))

| Map | Light | Preset | Directional | Sky | Owners | Exposure bias |
|---|---|---|---|---|---|---|
| L_Lunden | map | day | 1 | 1 | `Lunden Sky.Sun`, `Lunden Sky.SkyLight` | −1.965 (game) |
| L_Lunden | map | evening | 1 | 1 | `Lunden Sky.Moon`, `Lunden Sky.SkyLight` | −2.463 (game) |
| Pilot_L1007 | pilot | day | 1 | 1 | `Lunden Pilot Sun`, `Lunden Pilot Sky` | 0 |
| Pilot_L1007 | pilot | evening | 1 | 1 | `Lunden Pilot Sun`, `Lunden Pilot Sky` | −0.7 |

On both maps and at both presets there is exactly one directional light and one sky light. On L_Lunden both belong to
the map's own sky, with the sun by day and the moon in the evening. The pilot keeps its saved rig and its original
presets and biases (`capture_pilot.set_time`, 0 and −0.7 EV), so pilot captures are unchanged.

**Before #2306, for comparison:** the old rig's sun and sky light were added on top of L_Lunden (as
`capture_l1007.py`/`capture_exterior.py`/`capture_seasons.py` did). By day this counted **2 directional + 2 sky**
(`DirectionalLight`, `SkyLight`, `Lunden Sky.Sun`, `Lunden Sky.SkyLight`), and `count_lights` rejected it.

## Limits

- **Not the complete composed world.** On main 27be8ee5 a fresh checkout cannot build every level that
  `capture_world.loaded_capture_levels` (#2326) requires:
  - #2380: `MPC_LundenVegetation` is not checked in.
  - #2381: `build_lighting.py` fails on the stair light function.
  - #2382: `build_facade.py` uses attribute access that UE 5.8.4 Python lacks.

  The committed L_Lunden (cb0ca795) also has no streaming rows for `Level_facade_lighting`, `Level_vegetation_foliage`
  or the four interaction levels.

  The harness therefore relaxed only that completeness check and recorded the missing levels. The light counts above
  come from `Level_lighting` plus the levels that were present. If the facade level adds no directional or sky light,
  as its builder intends (window glass and lantern washes), the counts on the full world are the same. That is not
  verified here.
- **Local workarounds.** To build `Level_lighting`, the harness ran the following locally; none of it was checked in,
  and the worktree was restored afterwards:
  - `build_seasons.py`, to create the vegetation collection (#2380);
  - a rebuild of the lighting assets, made writable without LFS locks;
  - `build_lighting.py` without the stair light function (#2381).
- **No GPU picture.** Lights were counted in the editor world, and no new still was rendered. The full capture scripts
  will run once #2380–#2382 are fixed and L_Lunden is recomposed.
