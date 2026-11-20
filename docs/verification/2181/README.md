# #2181 Sound occlusion (walls, slabs, closed doors)

Audio has no images; the evidence is the measured real audio graph in `metrics.json`
(`tools/soundocclusionbrowser.cjs`, real app world + real `src/audio.js` in an OfflineAudioContext).

Setup: a real ground-floor swing door of the home (hinge 0.855, 3.050; Hall <-> Tvätt). Listener 1.8 m on one side (y 1.6),
source (bell, `sfx.playAt`) 1.8 m on the other side. Door state is the live `door.t`.

| Case | Estimate | Real graph | Rendered RMS | HF ratio |
|---|---|---|---|---|
| Listener in the source's room | null | no lowpass biquad at all | 0.00837 | 0.0879 |
| Behind the CLOSED door | door: -6 dB, 2200 Hz | one lowpass at 2200 Hz | 0.00161 | 0.0767 |
| Behind the OPEN door | openDoor: -1.2 dB, 9000 Hz | one lowpass at 9000 Hz | 0.00263 | 0.0848 |

(The highpass in each row is the bell's own voicing.) A looping dishwasher heard through the closed door: lowpass target 2200 Hz;
after the door opens and `updateOcclusion()` re-estimates, the same filter's target is 9000 Hz (eased with `OCCLUSION.ramp`).
Slab (listener one storey up): floor, -11 dB, 1000 Hz. Courtyard listener: the line crosses an entrance door, so `door`.

Before: every source sounded equally clear in any room (`out()` had no occlusion). After: only obscured voices get ONE lowpass
biquad and a gain; clear voices are untouched (no node). Estimate = one cell lookup + a few segment tests per effect; loops
re-estimate every 0.4 s. Tests: `node --test tools/soundocclusiontest.mjs` (9/9), `tools/soundocclusionbrowser.cjs` (9 checks).
All dB/Hz values are *guess* (`config.js` `OCCLUSION`).
