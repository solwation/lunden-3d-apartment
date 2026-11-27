# #2398: source-owned low-sun colour

Source checkpoint, not completed visual acceptance. Native save/reload, the Christmas
and June image pairs and the per-crop R/B ±10% gate remain pending.

The web's `DayCycle.update` uses the exported linear `sunLow` and `sunHigh`, mixed by
`smooth(0.05, 0.4, sunDir.y)`. The native sky already updated solar direction and
intensity, but never set its Sun component's colour. `UpdateSky` now sends that same
linear blend to `SetLightColor` on every update. Its solar elevation is native Z,
corresponding to web Y. No fitted RGB, temperature, exposure or intensity change is
involved. The Moon remains unchanged; the separate Sun is off on the moon branch.
The shared Sun affects every house, including direct summer sunlight, so the June
control and existing material-profile gates must be reviewed with the native result.

`test_lighting.py` adds the actual 24 December 2026, 14:00 acceptance case and reads
the real Sun component after each `UpdateSky`, including a return to the existing
seasonal cases. It checks the linear component colour against the export and records
both linear and stored sRGB8 values. The 0.005 linear tolerance accounts for Unreal's
sRGB8 `LightColor` storage; it does not permit the previous white fallback.
`check-sun.mjs` compares those observations against the web's source colours while
retaining the existing direction, cloud, weather and dusk checks. Historical results
without the new colour fields remain readable, but do not prove this new colour gate.

Source checks (no editor or asset writes):

- 26 emitted Blueprint math graphs evaluated against the actual solar colour statement
  from `DayCycle.update`: low/high boundaries, intermediate values, Christmas/June and
  modified exported colour values; maximum linear RGB error 0.
- Checker fixtures, explicitly synthetic colour observations on the prior source-bound
  direction result: positive 137/137 values and 21 directions, worst 0.0000°; replacing
  the Christmas colour with white exits 1 and fails green/blue. These are checker
  regressions, not new native execution evidence.
- Python/JavaScript syntax and `git diff --check` pass. Existing lamp event/38-colour
  assertions and material-profile constants are unchanged.

UE 5.8.4 primary source confirms `SetLightColor(FLinearColor, bSRGB)` stores
`NewLightColor.ToFColor(bSRGB)` and `GetLightColor()` converts that stored `FColor`
back to linear. Private scripts, fixtures and output are preserved under the active
session's `2398/`. Root owns native validation, asset locks and publication.

Original-only Unreal change. No web behaviour change, public downstream transfer or
player changelog is applicable.
