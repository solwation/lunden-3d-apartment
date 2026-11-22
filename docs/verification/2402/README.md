# #2402: hail and thunder in Unreal

*`orkester: solwation-w11-opus-5.5-20261122`, 2026-11-22. UE 5.8.4 on Windows, based on `7895ad76`. Web numbers from
`audio-params.json` (`export-audio.mjs --check`: current). Nothing was played aloud: every recording comes from the main
submix while `au.LinearGainScalarForFinalOutut` was 0, and the PIE tests ran with `-nosound`.* There are no pictures:
the change is sound only, so the evidence is the measurements below, [`audio-render.json`](audio-render.json) and
[`render-params.json`](render-params.json). The build is described in
[unreal.md](../../development/unreal.md#footsteps-wind-and-outdoor-sound-2287).

## Checks

| Check | Result |
| --- | --- |
| `export-audio.mjs` | writes `hail` and `thunder`; the fitted thunder equals the web's own `sfx.thunder` on all 36 captures (6 nearnesses × in/out × 3 random draws) ✓ |
| `build_audio.py`, again, then `--check` | built 23 assets (new `MS_LundenThunder`); second run "unchanged, nothing saved"; `LUNDEN_AUDIO_CHECK_OK 23 assets, spec fca6ff6f258c` ✓ |
| `test_audio` (`-nosound`) | passed: the #2287/#2320 checks plus hail and the strike rule (below) ✓ |
| `test_audio`, `test_fixture_material`, `test_window_audio` in one editor (`-nosound`) | passed 3, failed 0 (the #2401 combined run) ✓ |
| `test_audio_render` (`-RenderOffScreen`, final gain 0) and `audio-render-compare.py` | every row within ±2 dB; the delayed thunder starts on time ✓ |

## The trigger (`test_audio`)

- **Hail** (`Rain` 1, `Hail` on): outdoors on the grass `RainGain` 0.0896 = 0.07 × 0.8 × 1.6 and cut-off 9,000 Hz;
  indoors on the parquet 0.02688 (× 0.3) and 900 Hz, the web's values. With hail off again the rain's indoor values
  come back.
- **No strike without the web's storm:** with no storm and rain 1, a storm and rain 0.5, or a storm and no rain,
  `NextStrike` stays at 0.05 s and nothing strikes for 0.4 s (weather.js: `storm && rain > 0.5`).
- **Countdown:** in a storm, `NextStrike` fell 0.500 s in 0.500 s of game time.
- **Strikes:** 8 outdoors and 8 indoors. Each counted once, with a distance of 400–4000 m and the nearness
  `1 − (d − 400) / 3600`. The delay was distance / 343 m/s, and the next strike was drawn in 6–22 s. `ThunderInside`
  matched where the player stood. In the combined run the distances were 725–3,787 m, the delays 2.1–11.0 s and the next
  draws 6.8–21.8 s. Under `-nosound` no voice is created, so the render
  below plays the thunder the way `Strike` does.

## Render against the web

Hail: 1.3 s of steady sound, the web side computed with the parameters the Unreal component used. Thunder: on the
road (no room reverb), created and played as `Strike` does it, with no delay. Four Unreal takes and twelve web draws
per case; the level is the power mean of the takes' RMS, because each draw has its own rumble length and rolls.

| Sound | Level web / Unreal (dBFS RMS) | Difference | Centroid web / Unreal (Hz, first take) |
| --- | --- | --- | --- |
| hail outdoors (grass, under trees, 9 kHz) | −28.4 / −29.3 | −0.88 dB | 5,124 / 4,757 |
| hail indoors (parquet, roof layer, 900 Hz) | −44.7 / −44.6 | +0.10 dB | 659 / 649 |
| thunder near 1.0, outdoors (crack, rumble, rolls) | −30.0 / −30.4 | −0.36 dB | 5,061 / 4,112 |
| thunder near 0.2, indoors (160 Hz, × 0.45) | −45.5 / −45.7 | −0.20 dB | 126 / 121 |
| thunder near 1.0 with `Delay` 1 s | onset 1.010 s | within 50 ms | |

The take lengths (down to −40 dB under the peak) overlap: near, web 2.4–4.0 s and Unreal 2.6–3.4 s; far indoors, web
3.7–5.2 s and Unreal 3.4–5.4 s. The same render repeats the #2320 rows: rain −0.60 / +0.40 dB, window −0.12 dB and
every footstep profile within ±0.7 dB (`audio-render.json`), so nothing else moved.

*Approximations:* as for the footsteps, the envelopes run at the MetaSound's block rate (5.3 ms segments,
interpolated), which is longer than the crack's 2 ms attack. Each burst has its own noise generator, where the web
reads one shared 2 s noise buffer from a random offset. The car cabin's thunder level is not ported.

## Not done here

`BP_LundenSky` has no hail, storm or lightning (only rain and snow on and off). The sounds therefore follow the
component's `Hail` and `Storm`, which a test sets, and not the sky. Adding them to the sky means saving Lighting
assets, which were LFS-locked for #2394: [#2439](https://github.com/solwation/lunden-3d-apartment/issues/2439).
