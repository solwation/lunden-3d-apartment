# #2102 Cloud shadows — verification

Before = base `249876a` (`src/daycycle.js` served from it, so `src/cloudshadow.js` never loads), after = this change. Headless Chromium
(SwiftShader), 480 × 300 viewport shot at 1280 × 800 (quality 3 + shadows), June 15 2026 13:00, `tools/cloudshadow2102browser.cjs`
(PNG converted to JPEG q82). "Partly cloudy" = overcast 0.45 without rain (weather state stubbed); the cloud clock is pinned to
0 s and 40 s (5 m/s → 200 m drift towards −x). Before-images live in `before/` and are removed when the issue is resolved.

| View | What it shows |
|---|---|
| `park-before-t0-t40.jpg` | over the park, 55 m up facing WNW (`at=-8,52,110,-28,55`): before, after at 0 s, after at 40 s — soft shade patches on lawns, paths, roofs and facades that move between the two moments |
| `yard-before-t0-t40.jpg` | over the courtyard / Hus L roofs, 30 m up facing north (`at=20,70,0,-22,30`): same three frames |
| `*-part-t0-after.jpg`, `*-part-t40-after.jpg` | the full-size after frames |
| `*-clear-after.jpg` | clear sky: identical to before (mean abs. difference 0.01 / 0.00 grey levels, birds aside) |

Results (`browser-before.json`, `browser-after.json`): zero page and shader errors in both phases; draw calls and program counts
identical before/after in all six views (park 141/61, yard 390/85 calls/programs), so the patched lights chunks compile in grass,
roofs, render, hedges, railings, cars, benches and the hazed/fogged materials without new programs. Strength 0.85 partly cloudy,
0 at clear sky. Mean abs. difference t0 vs t40: park 4.7, yard 5.2 grey levels (the drift).
Node: `tools/cloudshadowtest.mjs` (5 tests: chunk patch + shared uniforms; zero at clear sky, full overcast, night and indoors; more
shade with more cloud, shade keeps 1 − strength, soft edges; drift follows the wind exactly, wraps seamlessly, deterministic; walls
and roofs share the ground's cloud along the sun ray), `tools/aerialhazetest.mjs` passes.

Publicering: Pages/Worker success på `70131cb`; före-bilder borttagna vid stängning och visas från den commiten.
