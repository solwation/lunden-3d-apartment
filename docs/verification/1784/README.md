# #1784 — the hot-air balloon is hard to find

Captured in Chromium/SwiftShader (`?shot&test&time=12&month=7&day=10&weather=clear&jetpack`, 960×600, drawing buffer 576×360) **without
`&balloon` and without overriding the balloon's clock**: the page's real `Date.now` is shifted into the scheduled window (600–900 s into
the 2400 s period), so the balloon follows its normal wall-clock schedule. The camera stands at the courtyard start spot (2.9, −12),
on the ground or in a jetpack hover at 260 m (above the cloud deck), facing the balloon. Coverage = share of buffer pixels that change
when the balloon mesh is hidden.

| Image | Shows |
|---|---|
| `fore-ovanfor-molnen.png` | Before (main be41a5b4, `radius` 260): hover at 260 m, looking level at it, ~296 m away: a ~25 px dot, 0.08 % of the picture. |
| `efter-ovanfor-molnen.png` | After (`radius` 100): the same view, ~121 m away, 0.50 % of the picture; rainbow gores and basket readable. |
| `fore-fran-marken.png` | Before: from the ground looking up at it, ~396 m away: a ~10 px hazy dot (0.04 %). |
| `efter-fran-marken.png` | After: from the ground, ~290 m away (it is 250 m up), 0.08 %: still small, but now nearly overhead instead of low over the far horizon. |
| `test-riktigt-schema.png` | The new `tools/balloontest.cjs` check's view (real schedule, hover at 260 m): drawn, in view, 0.74–0.87 % of the picture. |

Findings: with the real schedule the balloon was drawn correctly (mesh visible, scale 1, in the frustum, `hidden` = `player.below`
false outdoors, clock = wall-clock seconds, not covered by the cloud deck, sky or fog). It was simply far (always ~260–290 m from the
courtyard on its 260 m circle), small, and down 25 % of the time (at the time of the user's report the real clock was ~2100 s into the
period, i.e. in the off gap). Fix: `radius` 100, `window` 2160 of 2400 s (both *guess*).

Checks: `tools/balloontest.cjs` ALL PASS (16 checks, incl. the two new real-schedule checks); phone perfcount — see the issue comment.
