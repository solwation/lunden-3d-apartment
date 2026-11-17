# Head silhouette, chin underside and neck — #2043

Baseline `b5cb5c95` (before: its `src/avatar.js` + `src/config.js` served in place of the checkout's).
`tools/avatarcontour2043browser.cjs` on `tools/avatarexpr.html` (SwiftShader).

| Image | Shows |
|---|---|
| [before](https://github.com/solwation/lunden-3d-apartment/blob/43a9b477/docs/verification/2043/before/contour.png) (removed at closure) / `contour.png` | daylight. Rows: light skin, short hair; dark skin, full beard + moustache, cap and headphones; medium skin in the Spider suit; jaw slider square + beard + short neck; jaw slider pointed + long head + long neck. Columns: front, three-quarter, profile, low three-quarter (under the jaw) |
| [before](https://github.com/solwation/lunden-3d-apartment/blob/43a9b477/docs/verification/2043/before/contour-backlight.png) (removed at closure) / `contour-backlight.png` | the same views with the sun behind the head |

Before: the cheek and jaw outline broke into straight segments between the head rings, the chin had a
flat underside, and the chin sat straight on an 8-sided cylinder neck (facets visible in the Spider
suit's profile). After: the outline follows a monotone cubic through the same authored rings with nine
extra rings where it curves, the chin's underside is a rounded dome, and the neck is a smooth 16-sided
column set back under the jaw (the under-jaw shows in profile) with a soft larynx bump. Jaw angle and
chin keep their authored positions; the jaw, head and neck sliders, beard, cap, headphones and Spider
mask follow without gaps.

Checks: browser run PASS with no page or shader errors in either phase (`browser.json`); triangles per
figure +592 (12,424 → 13,016 bare; head-bone parts 6,604 → 7,196 = +9.0 %, shell 864 → 1,392, neck
32 → 96), one draw. Node: avatarheadtest 8/8 (new #2043 budget/chin/neck test), riggedavatartest 11/11
(posterior profile now on `profileAt`), avatarhittest 4/4, avatarexprtest 3/3, avatarbodytest 12/12.
Gameplay head boxes: `tools/headboxesbrowsertest.cjs` ALL PASS 28 checks.
Not covered: the back of the skull keeps its authored (pointed) occiput, now rounded only at the
ring; the beard's own grid outline; physical devices.
