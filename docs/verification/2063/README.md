# Inset avatar eyes — #2063

Baseline: `b78e0b64` (same head/eyes before this change). Candidate source is the accompanying
#2063 commit. Chromium/SwiftShader, MSAA, 640 × 400 canvas, game's four-light/tone-map component
fixture, same appearance code, poses, camera offsets and light inputs on both revisions.
All sheets have **before above, after below**; each labelled cell records the skin/view/input.

- `ogon.jpg`: light, medium and dark skin, front / 45° / 60° / 90° profile. The far globe no longer
  projects beyond the nasal silhouette at 60°, and the profile is covered by the temple/cheek.
- `narbild.jpg`: the left eye enlarged, same four angles; light/dark skin half and full blink.
  Upper/lower lid margins close over the inset globe; no white leaks at full blink.
- `reglage.jpg`: minimum and maximum eye width/height at front, 60° and profile.
- `tillbehor-blink.jpg`: three spectacle kinds, gaze at its limits during open/half/full blink,
  and backlight. Spectacle front stays at its previous 0.1265 m nasal-bridge position.
- `browser.json`: 33 matched views on each revision, zero page/console errors and one draw per view.

## Checks and budget

`node --test tools/avatarsockettest.mjs tools/avatarlidstest.mjs tools/avatarsculpttest.mjs tools/avatargazetest.mjs`
passes **14/14**. The new check uses the production geometry and Avatar material to check that the globe
is behind the brow, eye-size/shape values 0/4/8 retain their range with fixed z depth, the existing
spectacles and diving-mask glass clear the eye, and the single SkinnedMesh is retained. Existing checks
cover lid/sclera continuity, blink, gaze limits and shared head/lip shading.

Budget before/after: **1,248 eye triangles and 15,620 triangles in the style-0 figure**, unchanged.
Same skeleton, one material/draw, no shader operation, varying, attribute, light, pass or texture added.
Only geometry coordinates and an existing uniform's z value change.

The initial sequential capture's synchronous render + PNG readback measurement was 109.92 → 155.11 ms.
A focused paired check alternated before/after order over six rounds on the same browser, with warmup
and identical pose/input. Median **104.93 → 109.99 ms** (+4.8%); ranges 104.44–110.12 / 108.61–116.17 ms,
zero errors (`timing-paired.json`). This is shared-host **software rasterizer plus image encoding** cost,
not the game's native GPU frame time or a physical-device result. The large initial difference was not
reproduced in the alternating check. No whole-world/performance sweep was run.

## Reproduction

Serve this checkout on 8171. For the baseline, extract `src/`, `data/` and `tools/` from `b78e0b64` to a
separate temporary directory, expose the unchanged `models/` there, and use the candidate
`tools/avatareyes.html` harness with its `uEye.value.set` third component restored to `eyeSize`.
That harness-only compatibility change enables the same slider cases on the old source.
Serve the baseline on 8170, then run:

```sh
PLAYWRIGHT_MODULE=/home/olof/github-dashboard/node_modules/playwright \
  tools/browsertest.sh node tools/avatarsocket2063browser.cjs \
  http://localhost:8171 docs/verification/2063 http://localhost:8170
# Focused timing only, if diagnosing shared-host drift:
PLAYWRIGHT_MODULE=/home/olof/github-dashboard/node_modules/playwright \
  tools/browsertest.sh node tools/avatarsocket2063timing.cjs \
  http://localhost:8171 docs/verification/2063/timing-paired.json http://localhost:8170
```

Not separately tested: physical devices, the full-world mirror/preview/network route and an in-water
diving-mask screenshot. Those use the same production builder and independent mask-front constant;
mask front clearance was checked numerically. Avatar-only change: no public downstream transfer.
