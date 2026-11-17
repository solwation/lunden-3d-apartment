# #2068 — dark hair without grey reflection bands

Source: `2d4974f60e6d7f78cfafb6d071515bdac8192d45`; matched baseline `24957657`.
The baseline route serves its actual `avatar.js`, `config.js` **and**
`avatarhairgloss.js`; all unchanged dependencies/assets use the same checkout.
Captured 2026-11-17 in Chromium/SwiftShader, MSAA4, device pixel ratio1,
through the shared browser wrapper, using the production `Avatar` component.

## Result

`dagsljus.jpg` and `motljus.jpg`: each pair of columns is before/after,
three-quarter, profile and back. Rows: short black, short brown, long black,
curly black, brown bun, blond and grey with beard. Dark hair stays dark and its
narrow reflection follows the existing strand direction. The broad grey-white
reflection has gone; blond and grey retain their brightness. `rorelse.jpg` is
a six-frame camera orbit, baseline above, candidate below.

The primary reflection used to add white regardless of the hair's albedo.
`AVATAR_HAIR_GLOSS.darkRange` now blends to a narrower hair-tinted primary on
dark hair, with a narrower warmer secondary. Bright albedos keep the old lobes.
The existing strand tangent, jitter, footprint fade, wet sharpening, curl flow,
beard/brow/flyaway coverage, street-lamp light and backlit rim are retained.
The visual settings are guesses rather than measured physical hair parameters.

## Verification

- `node --test tools/avatarhairglosstest.mjs tools/avatarshorthairtest.mjs`:
  **7/7 pass**. Strand direction, hanging curtain, shader on/off/attributes,
  short hair and bun geometry/budget remain correct.
- `PLAYWRIGHT_MODULE=/home/olof/github-dashboard/node_modules/playwright tools/browsertest.sh node tools/avatarhair2068browser.cjs http://localhost:8175 docs/verification/2068`:
  **pass**, zero page/console/shader errors, one draw per figure, saved paired
  daylight/backlight images and orbit inspected. Peak browser memory747MiB.
- Combined diff inspection: only reflection colour/width changes in production,
  with config, cache key, matching fixture, documentation and changelog updated.

## Budget and performance limits

No added triangles, retained attributes, textures, varying, lights, material,
passes, rig bones or draw calls. Whole-figure before/after counts are equal:
short15,660; long16,680; bun16,112; curly21,816; grey with beard16,624.
Geometry and the 15-bone rig are untouched, so head triangle growth is zero.
The shader adds a brightness smoothstep, scalar/vector mixes and products inside
`hgSpec`; the same two lobe powers are retained with no added texture lookup or
trigonometric operation.

`hair.json` records all samples. Same-input timing alternates before/after three
times, eight frames per sample with readback, software renderer at640×640:

| Case | Before ms/frame | After ms/frame | Ratio of minima |
| --- | --- | --- | --- |
| Close head | 225.41,251.38,283.59 | 235.34,282.83,266.50 | 1.044 |
| Nine figures | 946.86,783.70,1088.00 | 981.88,1295.60,928.61 | 1.185 |

A second browser was active on the shared machine; these spread-out software
measurements do **not** establish unchanged cost or physical-device performance.
The narrow-band change adds arithmetic; no device FPS guarantee is made.
The orbit's mean image change fell2.781→2.340 and large-jump share
0.01018→0.00991 (camera motion included; this is a diagnostic, not proof of
absence of all flicker). This was a component run, without a full-world sweep.

Player avatars are original-only; public downstream transfer does not apply.

Published on main as `1a5b33ed352bf597a714a1020d0395047d2ee704`; Pages44160001376 and Worker44160001183 passed. Revision-pinned result images are embedded in the issue before closure.
