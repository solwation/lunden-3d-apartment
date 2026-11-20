# #2214 Kjolrem vid huk

Component page `tools/avatarskirt.html` (the rig's real `crouch: 1`), trousers | skirt | dress, cropped 600x470.

- `before/squat-front.jpg`, `before/squat-q.jpg`: before; a thin strap of hem runs knee to knee (the back panel, carried under the thighs).
- `squat-front.jpg`, `squat-q.jpg`: after; no strap, the skirt and the dress sit on the lap as before.

Cause: the back panel is skinned to the thighs from the hip crease down; on a crouch the knees are ~0.40 apart, so its hem ran forward through the gap under the thighs. Fix: `hemTuck` (src/avatarskirt.js), gated on both thighs flexed and apart (`AVATAR_CLOTH.spread`), so seat, walk, cycling are unchanged (`after-sit` / `after-cycle` captures looked as in #2157).
Checks: `node --test tools/avatarskirttest.mjs` 38/38 (3 new), avatarclothtest.mjs 4/4, all other `tools/avatar*test.mjs` importing config/avatarcloth pass.
