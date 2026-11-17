# Nose shape variants: straight, convex, upturned, broad — #2049

`tools/avatarnose2049browser.cjs` on `tools/avatarexpr.html` (SwiftShader, `Math.random` seeded so both phases
see the same saccades), camera 0.42 m from the nose. Baseline `b622b587` (its `src/avatar.js`, `src/config.js`
and `src/avatarnose.js` served in place of the checkout's) for the old-code comparison.
Columns everywhere: front, three-quarter, profile, low three-quarter, from below.

| Image | Shows |
|---|---|
| `nose-forms.png` | daylight. Rows: straight, convex, upturned, broad on light skin, then the same on dark skin (middle sliders) |
| `nose-forms-raking.png` | the same with a low sun from the side (form only) |
| `nose-forms-extremes.png` | medium skin: each variant at the smallest + narrowest and at the largest + widest sliders (rows 1–8: straight, convex, upturned, broad), then convex and broad in the Spider suit |
| `old-codes.png` | old codes (light, medium, dark skin): pixel-identical to the baseline |

Straight is #2048's nose. Convex: a hump on the dorsum and a drooping tip, clearest in profile and
three-quarter. Upturned: the tip lifted, a scooped dorsum, more of the nostrils from the front and below.
Broad: a lower, flatter bridge and a wider nose, its wings further out. All four combine with the size and
width sliders without folds; the Spider mask stays smooth for every variant.

Checks: browser run PASS, no page or shader errors in either phase (`browser.json`); the old-code sheet
(1,014,000 pixels) is identical to the baseline (0 differing, largest channel delta 0). Triangles per figure
15,000 before and after for every variant (no geometry change: one shared geometry, one draw, a vec3
uniform, no attribute, texture, light or pass). Node: `avatarnosetest` 8/8 (old codes and straight keep the
offset exactly zero; no triangle turns over for any variant at any size / width end, worst dot 0.5 for broad
at the largest and widest; no dent behind the face; the variants differ: hump > 2.5 mm, tip droop > 1.5 mm,
upturned tip > 2.5 mm up, broad bridge > 4 mm lower, wings > 2 mm wider, the inner eye corner moves
< 0.5 mm), `avatarcustomizertest` 25/25 (the shared `n` tag, old codes re-encode unchanged, bad values
skipped, through the Worker's `cleanState`, within the extension limit, Slumpa picks every variant),
`avatarheadtest` 9/9, `riggedavatartest` 11/11.

Frame time (`frameMs`, ms per daylight sheet, same inputs, SwiftShader on a machine shared with other
browser jobs): the 3-row old-code sheet 4.3 before / 5.2 after (within noise; the straight path only adds a
uniform test), the 8-row variant sheet 11.8 (1.5 ms per row against 1.7 for the old codes). Relative only,
not a GPU measurement. Shader cost: the offset and the normal's three evaluations run only for head vertices
inside the nose's box and only when a variant is chosen.

Not covered: physical GPUs/Surface, the in-game mirror and the customizer's live preview (same material and
uniform; the customizer's buttons are covered by the node test's code path, not a browser click). At the
largest + widest sliders a faint shading edge shows on the cheek beside the wings for every variant (row 2
straight as well): #2048's width slider moves vertices without turning their normals; the broad variant adds
to it.
