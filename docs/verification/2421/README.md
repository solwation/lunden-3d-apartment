# #2421 source night-sky candidate

Refs #2421; this is a partial source checkpoint, not visual acceptance or issue closure.

The original START night uses 2026-11-16 at 18:15. The real `DayCycle` gives
sun direction y = -0.3254052507723656, daylight zero and all dusk amounts zero.
The already exported `site.sky.clouds.palette` supplies its linear-sRGB night
zenith/horizon and overcast endpoints. `sky_clouds.py` transcribes the actual
gradient, overcast interpolation, procedural cloud colours and horizon fade.
The guessed 1.53 EV atmospheric lift is removed.

The source sky shader includes `colorspace_fragment` and omits
`tonemapping_fragment`. The native pass therefore analytically inverts the
existing Neutral black offset before multiplying by EyeAdaptationInverse.
Night colours remain below Neutral's compression knee; this needs no RGB gain
or exposure fit. The existing daytime method is byte-identical.

The source dusk envelope's -0.17/-0.04 endpoints smoothly blend this full-night
candidate into the retained native twilight. This blend does **not** implement
the source dusk bands, glow or cloud rims. June 21 at 22:00 has sun y =
-0.022644218576034714 and is unchanged; at 23:30 it still has nonzero source
dusk and cannot be called full-night parity. High-altitude/cloud-deck handling,
moon/star compositing and the other START lighting differences remain separate
acceptance work. No ambient, PBR, lamp or fog values are changed here.

Actual corrected Native run `20261127T220524277025-2781055`, source
`24f37d92d5d76756985300bcd1a468591f8d7a41`, took 374.5 seconds. Native,
runner and outer launcher exited 0; the explicit shader-error scan passed.
All 20 canonical steps actually ran and passed. Seven normal Lighting output
paths were saved; six changed and are versioned in `99a81a22`. Clouds stayed
unchanged. All 247 authored packages ended readonly, protected packages and
source/export stayed exact, Generated stayed exact after build, and the actual
saved-level Sun's physical fog/shadow settings matched the pre-build values.
No explicit disk reload, fresh Automation, gameplay or Windows release claim.

`source-checks.json` records actual versioned-LFS-provenance Lighting freshness
and its regressions after rebuilding, plus five source-overcast fixtures and
6,615 analytical roundtrips. Saved signature is
`279ad5d3ecc842f20c6a9a90f07af8ad7d6bcde379e2a3c5b909d8fba090a3ee`.

One five-pair canonical measurement was made, with the sky ROI and Y limits
locked beforehand. Sky Y **0.746835 fails** the retained 0.8–1.25 range.
Relative R/B **0.890499** passes the explicitly new local ±15% guess; that guess
is not an original requirement. Whole-frame Y 0.754717 is diagnostic only.
All 22 apartment numeric rows and their existing material/hue guards pass.
The four apartment web references are reused exact locked originals; START
is one fresh source-bound browser batch at 2026-11-16 18:15, clear sky.

All ten original images were reviewed. Upper facade pallor, gray foreground,
yellow entrance pools and the neighbor's dark left window remain unresolved;
all five original points remain open under #2421, without intentional waivers.
Existing apartment differences remain mapped in `whole-image-review.json`.
The source transcription is an honest partial checkpoint, **not issue closure**.
No exposure/gain or ROI adjustment was made after seeing the result. Next work
must identify the actual remaining sky rendering/source mismatch and native
window/light state before another candidate, rather than fitting the image.

The first run returned three process zeros but its shader failed because of a
local `offset` name collision. Its fallback images were rejected and never
measured. The collision was corrected to `blackOffset`; raw failure truth is
retained in `rejected-first-shader-run.json`. Independent runner bug #2496 now
rejects this class of false success.

This is original-only Unreal implementation; public downstream and web-to-Unreal
transfer do not apply. No export sources, new geometry or personal content changed.

## Follow-up source candidate: complete night composition

The next source correction preserves the web shader order: raw moon, halo and
stars are composed before cloud occlusion; only then is the complete sky passed
through the analytic inverse of Neutral. Previously the native night branch
inverted the dim gradient/clouds first, then added an un-inverted moon and stars
above the clouds. This is a source-order/curve defect, not a measured explanation
of the prior 0.746835 result. The daytime method remains byte-identical.

The inverse now includes Neutral compression/desaturation for bright lunar
pixels. Targets outside its finite, nonnegative inverse domain keep the existing
native path, without clipping or fitted values. The retained twilight blend and
high-altitude limitations still apply. No lamp/window/fog/PBR/exposure adjustment
is part of this candidate; all five issue acceptance points remain open.

Pure checks pass: the actual installed Three170 curve round-trips 143 composed
celestial fixtures plus the prior 6,615 dim-sky fixtures; source-order assertions
and the existing daytime check pass (4,364 roundtrips/116 explicit domain
rejections). These checks do not execute HLSL, compile a material or demonstrate
native pixel acceptance. Root must perform the next controlled material build
and same-view comparison before this candidate can be accepted.


## Verified night composition (2026-11-28)

Actual source `27a3eb11c5131634aa5c26f3a0e67ec2098be3cf` was built and
captured once in run `20261128T061926872723-1264221` (243.73 seconds).
The completed runner reports Native exit0, no timeout and no log errors; the
outer command exited0. The independent kernel observer was interrupted143
before recording exit, so it supplies no independent exit proof.

The same unchanged sky ROI now has Y **0.962025 PASS** (original0.8–1.25),
compared with the previous0.746835 failure. Relative R/B **1.024155** passes
the explicitly local ±15% guess, which is not original acceptance. Whole-frame
Y0.849057 is diagnostic only. One canonical Chromium measurement batch also
passes all22 existing apartment numeric rows and hue guards. All ten original
images were reviewed; no ROI, exposure, gain or source RGB was adjusted.

The source correction composes moon, halo and stars before cloud occlusion,
then inverts Neutral over the whole composed sky. Bright lunar pixels use the
real compression/desaturation inverse. Previous text about all night pixels
remaining below the compression knee describes only the earlier dim-gradient
implementation, not this complete composition. Daytime remains byte-identical.

Seven normal Lighting saves were attempted in the controlled locked window.
The changed Lighting was rebuilt and checked; current PBR and allfive images
actually ran. Unchanged prior full20/import/geometry evidence was reused
explicitly; there was no new full20, Automation or release-gate invocation.
Capture verification reports scene restoration,247 readonly authored packages,
exact post-build Generated and exact source/export. Independent postflight is
saved alongside the measurements.

**#2421 remains open.** The sky point now passes this original view, while the
pale upper facade, gray foreground, yellow entrance pools and dark left neighbor
window remain unresolved. Apartment numeric success does not imply identical
whole images. Current originals and truthful source/process evidence are in
[`night-composition/`](night-composition/), including
[`whole-image-review.json`](night-composition/whole-image-review.json).

Original-only Unreal change; no public downstream or additional web port applies.
