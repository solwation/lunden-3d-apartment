# #2124 Dawn / dusk sky colour depth — verification

Before = base `7dced376` (`src/daycycle.js` and `src/aerialhaze.js` served from it), after = this change. Headless Chromium
(SwiftShader), 480 × 300 viewport shot at 1280 × 800, June 15 2026, 22 m above the park (`at=-8,52,…,14,22`, pitched 14° up),
`tools/skydusk2124browser.cjs` (PNG converted to JPEG q82). Before-images live in `before/` and are removed when the issue is resolved.

| View | What it shows |
|---|---|
| `sunset-clear-*` | 21:33 facing the setting sun (WNW, sun y 0.02), clear: warm horizon, bright halo round the sun, pink → violet higher up, darker zenith, cloud edges near the sun lit warm |
| `sunset-part-*` | the same under a partly cloudy sky (overcast 0.45): the band, halo and zenith are damped, the lit cloud edges fade more gently |
| `dawn-clear-*`, `dawn-part-*` | 04:36 facing the rising sun (NE, sun y 0.01), clear and partly cloudy |
| `dusk-away-*` | 21:54 facing away from the sun (sun y −0.02): violet band over the eastern horizon, the full moon rising, cooler violet-grey cloud bodies |

Results (`browser.json`): zero page and shader errors in both phases; draw calls and program counts identical before/after in all
seven views (e.g. sunset 112/68, dawn 201/92 calls/programs); same fog colour (the horizon colour is untouched). Noon (13:00) and night
(01:00) controls: identical zenith/fog and a mean pixel difference of 0.03 / 0.006 (birds and particles), i.e. day and night unchanged.
Node: `tools/skydusktest.mjs` (5 tests: zero by day, at a December noon and at night in the real DayCycle; colours per sun height;
overcast damping and off inside the cloud deck; the haze contract — full fog straight towards the sun = the sky's horizon glow +
halo in output space, clear/partly cloudy/dawn/overcast; one sky program without variants) and `tools/aerialhazetest.mjs` pass.
Cost: no pass, texture, light, draw or program variant; a few uniforms and ~15 ALU ops in the sky fragment shader, three
multiplies + one mad per fogged fragment (the halo reuses the haze's pow 6), `duskSkyState` ~0.3 µs per frame.

Publicering: Pages/Worker success på `e151425`; före-bilder borttagna vid stängning och visas från den commiten.
