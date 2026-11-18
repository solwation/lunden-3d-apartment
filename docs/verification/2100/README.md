# #2100 Aerial perspective — verification

Before = base `34bd557` (`src/daycycle.js`/`src/divelook.js` served from it, so no haze), after = this change. Headless Chromium
(SwiftShader), 480 × 300 viewport shot at 1280 × 800, June 15 2026, `tools/haze2100browser.cjs` (PNG converted to JPEG q82).
Before-images live in `before/` and are removed when the issue is resolved.

| View | What it shows |
|---|---|
| `park-day-*` | 22 m above the park facing WNW (`at=-8,52,110,-3,22`), 13:00 clear: far trees and the backdrop houses take a blue haze, then the pale horizon |
| `park-sunset-*` | the same at 21:12 facing the setting sun: far silhouettes warm towards the sun's horizon glow |
| `park-rain-*` | the same at 13:00 forced rain (fog far 80 m): the mid-range thickens sooner |
| `street-day-*`, `street-sunset-*`, `street-rain-*` | the street north of Hus L at eye height (`at=0,-21,95,-1`): the near field (< 45 m) is unchanged |
| `park-far-band-before-after.jpg` | crop of the park horizon band: day before/after, sunset before/after |

Results (`browser.json`): zero page and shader errors in both phases; draw calls and program counts identical before/after in all
six views (e.g. park 116/60, street 194/75 calls/programs by day); same fog near/far/colour. The scenes include grass, roofs,
hedges, render, railings, parked cars and lamp washes (sunset), so the patched fog chunks compile in all of them.
Node: `tools/aerialhazetest.mjs` (5 tests: chunk patch and shared uniforms, near field 0 before fog near for every weather,
clear lighter than overcast, night = stock, bluer mid haze by day, warm haze = the sky's horizon glow at full fog),
`tools/lodtest.mjs` and `tools/grassdetailtest.mjs` pass. CPU: `hazeState` + `applyHaze` ~2 µs per frame.
