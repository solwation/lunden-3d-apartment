# #2300: the player's surface sensor, rest, outdoor sprint and death in Unreal

*`orkester: solwation-w11-opus-5.5-20261121`, 2026-11-21. UE 5.8.4, headless (commandlet and PIE tests). Export of
`f296c954` with this issue's builders and tests.* What was built is described in
[unreal.md](../../development/unreal.md#surface-outdoor-sprint-rest-and-death-2300).

## Checks

| Check | Result |
| --- | --- |
| Export: every GLB byte-identical with and without `export-player.js` (export of `origin/main` `ebf8d9b3` vs `f296c954`, all 9 zones); `check-export.mjs` | identical; "Unreal export is current", schema valid ✓ |
| Export's own comparison of the Unreal lookup with the web's `stepInfo` (`spawn.surface.check`) | standing points (n 15,915): surface 98.0 %, where 98.1 %, stairs 99.96 %, outdoor 98.5 %; open ground (n 20,000): surface 99.5 %, where 100 % |
| `test_player_world` (PIE on the composed `L_Lunden`): 9 control points from the web's own data. `StepInfo` at the web point, and `FeetInfo` after the player stood on L_Lunden's real floor there | 9 of 9 match at the point and 9 of 9 standing: parquet (Vardagsrum, Sovrum 1 upstairs), tile (Badrum), the patio's slabs (hard, exposed), a tread of Hus L's stairwell (hard, core, stairs), gravel and grass in the courtyard, the road at START, the garage floor ✓ |
| Same test: the export's 300 random points with the web's answers | 296 of 300 agree (the four are cell-edge cases, as in the export's check) ✓ |
| Sprint on real floors (L_Lunden) | street at START 480.00 cm/s (`runOutdoor` 4.8 m/s); L1007 living room 320.00 cm/s (`run`) ✓ |
| Rest (L_Lunden): looking at the sofa's first spot from 1.2 m, `PickSpot` picks it; one E press sits down | eye 0.00 cm from the spot's eye, view yaw −90.0° / pitch 0.0° = the spot's start view, view clamped to yaw −187.4…7.4° and pitch −63.03…45.84° (yaw ± 97.4°, `REST.sit`); E again stands up 0.00 cm from where the player stood, walking ✓ |
| Death (L_Lunden): `Die()` at START | woke on a web wake point (river side, −2599.2, 5886.5), 0.00 cm off in plan, standing 2.95 cm over its height (the capsule's float), facing 90° (the web's yaw π) ✓ |
| `test_player` (temporary level) | all #2284 values unchanged; Shift 320.00 cm/s inside L1007's footprint and 480.00 cm/s at START; the 4.5 m and 6.1 m falls kill: the blackout follows `src/fall.js` `paint` (≈360 frames each, worst alpha difference 0.0008, black with no red through `hold`) and the player wakes on a web wake point (0.00 cm off) facing 90° ✓ |
| `build_player.py` twice, then `--check` | second run "unchanged, nothing saved"; check passed ✓ |
| #2246 pilot tests | `test_pilot_walker` ✓ and `test_pilot_route` ✓ (on a locally prepared `Pilot_L1007`, reverted afterwards). `test_pilot_doors` fails **with and without** this change ("Entrance failed to start swinging after E", the door jumps to the origin), so it is not caused by #2300; reported to the conductor |

Files: [`player-result.json`](player-result.json) (temporary level) and [`player-world-result.json`](player-world-result.json)
(L_Lunden: every control point, the samples, sprint, rest and death).

No pictures: the checks are numbers, and the only visual part (the blackout) is a camera fade whose values the tests
read frame by frame. A headless capture would show only a black or red frame.

## Not tested

- A real keyboard on a visible window (the rule is no visible windows). The tests press E, Shift, W, Space and Ctrl
  through the engine's console input. The console holds a key "just pressed" on every frame it is down, so the rest
  test presses E for one frame only.
- Lying down (7 spots) runs the same code with the `lie` limits. Only a sofa seat was driven.
- The packaged game.
