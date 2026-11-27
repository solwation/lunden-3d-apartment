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
