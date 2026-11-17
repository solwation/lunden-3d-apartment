# Sculpted face — #2044

Baseline `2bcee334` (origin/main with #2043's head contour; before = its `src/avatar.js` + `src/config.js`
served in place of the checkout's). `tools/avatarsculpt2044browser.cjs` on `tools/avatarexpr.html`
(SwiftShader). Each image: before on the left, after on the right.

| Image | Shows |
|---|---|
| `forms.png` | light / medium / dark skin (codes `0…`, `2…`, `4…`), each in raking daylight (a low sun from the figure's left) and backlight; columns front, ¾ (yaw 0.65), profile (1.45); neutral face |
| `detail.png` | medium skin close-ups: raking (top) and backlight (bottom), front and ¾ |
| `expressions.png` | medium skin, raking light; rows neutral, smile, surprise, grimace (#2031), talking (#1122), kiss; columns front and ¾ without a beard, then front and ¾ with the full beard + moustache (#2041) |

After: a soft cheekbone volume and the hollow under it, a one-sided nasolabial fold from the nose wing
towards the mouth corner (deeper in the smile), a faint philtrum, shaded mouth corners and a softer lip
edge (no lit/shadowed rim; colour blends across the outline). The upper-lid sulcus and brow ridge move
the head skin, so lids and brows sit on them. Less painted socket darkening. Talking, surprise, grimace
and the kiss move the forms with the skin; the full beard's mouth opening shows no gap.

Checks: browser run PASS, no page or shader errors in either phase (`browser.json`); triangles per
avatar unchanged (12,976 bare / 13,940 full beard before and after: +0 %), no new attributes, one draw.
The frame-time figures in `browser.json` are SwiftShader timings of the same renders and are within
noise. They do not measure a GPU. Node: `avatarsculpttest` 3/3; `avatarheadtest`, `avatarexprtest`,
`riggedavatartest` and the other avatar node suites pass.
Not covered: physical GPUs/Surface, the in-game mirror (same material). The kiss row shows small torn
triangles beside the nose in both phases; that bug was already in the baseline and is outside #2044.
