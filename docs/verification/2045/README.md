# Round irises, thick lids, crease and lash line — #2045

Baseline `b5cb5c95` (before: its `src/`, `tools/` and `data/` served under `/before/`, with this branch's `tools/avatareyes.html` harness).
`tools/avatarlids2045browser.cjs` on `tools/avatareyes.html` (SwiftShader, MSAA, the game's four lights and tone mapping). Rows: före / efter.

| Image | Shows |
|---|---|
| `ogon-narbild.png` | the figure's left eye at 0.5 m (zoomed): light skin + blue eyes open, half blink, shut; dark skin + brown eyes open and shut; three-quarter; profile open and shut |
| `ansikte.png` | the face at 1.2 m: front light / dark, three-quarter, profile, round glasses, square glasses three-quarter, backlight, gaze down |
| `fjarran.png` | the face at 1 / 2 / 4 m at the game's 72° field of view (crops) |
| `lids.json` | far-figure flicker (mean per-pixel luminance std over 12 sub-pixel camera shifts) and the shut eyes' luminance percentiles |

Before: a ten-sided iris and pupil, a flat lid ring with no thickness, and a blink that squeezes the whole eye to a slit with iris
and eyeball still showing. After: a round iris with a dark limbal ring and a round pupil; upper and lower lids stand ~1.1 / 0.8 mm
proud of the eyeball (visible in profile and three-quarter), a shallow darker crease over the upper lid, a thin dark upper lash line
(a lash wedge plus the darker margin); the blink brings both margins together so the shut eye is skin from lid to lid with the lashes
folded down, in light and dark skin.

Checks: browser run PASS (no page/shader errors, one draw call per frame, no bright pixel in a shut eye, far flicker 0.20 / 0.27 / 0.27
against 0.20 / 0.28 / 0.23 before at 1 / 2 / 4 m — the 4 m difference is the darker margin line where the iris used to be, within the
check's tolerance); `tools/avatareyestest.cjs` (#2033 glint follows the sun, pupil sizes, shut eye) and `tools/avatargazetest.cjs`
(#2011 blink and gaze limits) PASS. Node: `avatarlidstest` 5/5, all `tools/avatar*test.mjs` + `riggedavatartest` 164/164.
Budget: eye triangles 608 → 1,248 per avatar (+640, 7.2 % of style 0's 8,904 head-bone triangles; limit +10 %), one draw call, no
new attribute/light/pass/texture. Not covered: physical devices, the in-game mirror (same geometry builder).
