# The nose: bridge, tip, alar wings, columella and nostrils — #2048

Baseline `37d922df` (before: its `src/avatar.js`, `src/config.js` and `src/avatarskin.js` served in place of the checkout's).
`tools/avatarnose2048browser.cjs` on `tools/avatarexpr.html` (SwiftShader), camera 0.42 m from the nose.

| Image | Shows |
|---|---|
| [before](https://github.com/solwation/lunden-3d-apartment/blob/4771179d/docs/verification/2048/before/nose.png) (removed at closure) / `nose.png` | daylight. Rows: light skin; medium skin; dark skin; nose sliders smallest + narrowest (light); largest + widest with round glasses (medium); medium skin in the Spider suit. Columns: front, three-quarter, profile, low three-quarter, from below |
| [before](https://github.com/solwation/lunden-3d-apartment/blob/4771179d/docs/verification/2048/before/nose-raking.png) (removed at closure) / `nose-raking.png` | the same views with a low sun from the side (form only) |
| [before](https://github.com/solwation/lunden-3d-apartment/blob/4771179d/docs/verification/2048/before/nose-backlight.png) (removed at closure) / `nose-backlight.png` | the sun behind the head |

Before: one smooth ridge from the brow to a pointed tip with a dark painted spot at the tip; no wings,
nostrils or transition into the cheek. After: a bridge narrowest between the eyes, a rounded tip of two
soft domes, alar wings with a crease along their upper outer edge into the cheek (#2044's nasolabial
fold starts just outside it), a short columella and two nostrils on the steep underside, seen from below
and from the low three-quarter view. The tip's shadow is the form's (the painted tip warmth dropped from
0.5 to 0.18 over a wider area); the nostrils' hollow is darker and takes ambient light out. The sliders
still differ clearly (rows 4 and 5); the glasses' bridge stays clear of the largest nose; the Spider mask
lies smooth (the height is subtracted exactly).

Checks: browser run PASS with no page or shader errors in either phase (`browser.json`). Triangles per
figure 14,344 → 15,000 (+656: the finer nose grid, 21 × 18, zipped into the head ring surface in place of
the quads it replaces); head-bone triangles 8,524 → 9,180 (+7.7 %, budget ≤ +10 %), one draw, no new
attribute, texture, light or pass. Node: `avatarnosetest` 5/5 (budget per variant, closed head skin with
every edge shared by two triangles, noseBlend = height for the mask, no slider end folds a triangle,
the forms), `avatarheadtest` 9/9 (the older whole-figure budgets leave the nose's own triangles out, as
for #2043/#2045/#2047), `riggedavatartest` 11/11 (incl. #1995 one connected nose surface, posterior
isolation), `avatarhittest`, `avatarexprtest`, `avatarbrowtest`, `avatarsculpttest`, `avatarlidstest`,
`avatarbodytest`, `avatarcustomizertest` pass. Rifle nose regions: a ray probe of the bind mesh at
x = 0 / 4 mm over the #1995 nose patches' heights finds rifleNose triangles throughout, the frontal
surface within 1.6 mm of the baseline's.

Frame time (`frameMs`, ms per daylight sheet of 30 close-ups, same inputs, SwiftShader on a machine shared
with other browser jobs): before / after 6.0 / 10.4 (`browser.json`), 12.1 / 9.8 and 10.1 / 8.1 in two
reruns, i.e. within the noise; relative only, not a GPU measurement. Shader cost: the vertex shader's
slider masks run only inside the nose's box; the fragment's `noseCavity` returns at once outside it.

Not covered: physical GPUs/Surface, the in-game mirror (same material), shape variants (#2049). The kiss
pose still stretches small triangles at the nose base where the muzzle's pucker stops at the nose
(`noseBlend > 0`): the pre-existing bug #2058, in both phases.
