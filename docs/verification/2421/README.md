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

Pure checks: `node --experimental-default-type=module --test
tools/unreal-engine/tests/night-sky.test.mjs` reads actual DayCycle uniforms at
five overcast values and checks 6,615 analytical Neutral roundtrips. The
freshness regression includes night-palette invalidation. The actual saved
sky package correctly reports stale against this new source; the full
`check-lighting.py` and `tests/lighting-freshness.py` acceptance must run after
Root's controlled build of the normal eight Lighting output paths. No extra
authored output, geometry export or new export metadata is needed.

Pending: actual material/Blueprint compilation, source-bound saved-asset
freshness checks, START night raw images and whole-image review, sky Y
0.8–1.25 and hue comparison, plus the relevant daytime/interior regressions.
Source tests do not establish rendered colour or a successful native process.
