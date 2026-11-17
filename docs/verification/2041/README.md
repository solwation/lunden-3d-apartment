# Beard mouth opening — #2041

Baseline `a0a5b562` (before: its `src/avatar.js` + `src/config.js` served in place of the checkout's).
`tools/avatarbeard2041browser.cjs` on `tools/avatarexpr.html` (SwiftShader, look `312050113` without glasses).

| Image | Shows |
|---|---|
| `before/beard-expressions.png` / `beard-expressions.png` | full beard + moustache (facial 3) mouth close-ups; rows neutral, smile, surprise, grimace (#2031 `uExpr`), talking (#1122 `uMouth` 1); columns front, ¾ (yaw 0.62), steep ¾ (0.95), steep ¾ from the other side (−0.95) |
| `before/facial-variants.png` / `facial-variants.png` | facial 0 none, 1 beard, 2 moustache, 3 beard + moustache; neutral, front and ¾ |

Before: a hard-edged rectangle of skin round the lips, and in the steep ¾ views the background shows
through a slit between the lifted shell and the face. After: an oval opening just outside the lips
whose edge lies on the skin and thickens into the beard over `AVATAR_BEARD.opening.feather`; no
slit in any ¾ view, the expressions and the talking jaw move the opening with the lips, and no
dark patch under the moustache (#2020).

Checks: browser run PASS with no page or shader errors in either phase (`browser.json`); fixture
triangles per avatar facial 0/1/2 unchanged (12,120 / 12,888 / 12,216), facial 3 12,872 → 12,964;
one draw per avatar. Node: facial 0–2 geometry bit-identical to the baseline for styles 0, 1, 3 (all
attributes); facial 3 for the default look 12,912 → 13,004 (+92, limit 13,257 from #2012);
avatarheadtest, avatarexprtest, avatarbodytest, avatarhemtest, avatarbreathtest, avatarweathertest
44/44, avatarcustomizertest + riggedavatartest 35/35. Not covered: the in-game mirror and
customizer UI (same geometry builder), physical devices.
