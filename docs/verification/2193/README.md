# #2193 footstep variants - verification (no images; audio only)

Run: `PLAYWRIGHT_MODULE=... tools/browsertest.sh node tools/stepvariantbrowser.cjs http://localhost:8438 OUT` (headless Chromium, the game's own
`src/audio.js` on an OfflineAudioContext, fixed seeds), then `metrics.json` = `OUT/result.json`.

Before: four profiles (wood, hard, grass, gravel). After: five more picked by `pickStep` from existing state: `snow`, `snowCold` (<= -5 C),
`wet`, `stair`, `leaves`.

Per-variant measured graph and signal (`metrics.json` `rows`): every variant is audible (rms > 0.001), peak < 1, one noise source, <= 2
oscillators, <= 5 gain nodes, one biquad (wet, snow, leaves: +1 gain; snowCold, stair: +1 oscillator). zero-crossings/s: hard 74, snow 310,
wet 476, leaves 792, snowCold 1144. High-band (>1.8 kHz) energy share: hard 0.001, snow 0.11, wet 0.12, leaves 0.37, snowCold 0.43 (squeak).
Stair: longest (208 ms active), highest rms (0.010) with a 190 Hz ring. Crackle A/B (mean of 8 seeds, grain on vs off): snow 2.74 vs 1.34 dB,
leaves 2.42 vs 1.16 dB envelope wobble.

Real controller (`metrics.json` `snow`, `warm`, `leaf`, `summer`): snowy grass at -8 C -> `snowCold`, at -1 C -> `snow`; October grass ->
`leaves`; July grass -> `grass` (unchanged). Stairwell scan: 828 tread samples classify `stair`, 3125 landing/floor samples stay `hard`.
Wet splash is verified in the pick test and the audio graph; the browser run did not rain the ground (not exercised end to end).
Zero page errors.
