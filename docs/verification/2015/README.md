# #2015 feet on stairs and slopes

Real app (`index.html?shot&quality=0&test=lazy`), the real `Player.groundAt`, a `Ghost` as another player and a `Ghost` as our own mirror image
walking 1.0 m/s up and then back down, `node tools/avatarfootikbrowser.cjs`. Stance foot = lowest heel/toe sole point over the ground under the
ankle (cm): maximum / mean over all stance frames (`footik.json` has p95 and the hip heights, m over the root). Penetration = lowest
sole point over that ground in any frame (negative = into the ground), also swing frames.

| Sequence | stance max / mean, before | stance max / mean, after | lowest sole, before | lowest sole, after | hips over root, after |
|---|---|---|---|---|---|
| Hus L (L1007) | 20.3 / 6.4 | 6.8 / 0.6 | -37.7 | -1.7 | 0.62 .. 0.93 |
| Hus A | 22.6 / 7.4 | 5.6 / 0.8 | -25.0 | -5.6 | 0.53 .. 0.96 |
| rampen vid Hus L:s östra gavel | 1.7 / 0.8 | 1.4 / 1.0 | -2.3 | -1.4 | 0.81 .. 0.88 |
| Hus L (L1007), spegelbilden (mirror image) | 20.3 / 6.3 | 6.3 / 0.1 | -20.3 | -3.9 | 0.65 .. 0.92 |

Before = the same code with the `ground` hook removed (the old flat-floor feet). Hus A's walking height is a ramp line through the tread
tops (+-9 cm from the drawn treads), so contact there is against that line. The ramp by Hus L's east gable falls only about 0.07 m/m, so the old
feet were already within 2 cm; the steeper synthetic ramp (0.2 m/m) is in `tools/avatarfootiktest.mjs`.

Images (a contact sheet each, 3 up-frames and 3 down-frames): `footik-house-L-stair.png` (behind, L1007's stair), `footik-house-L-stair-mirror.png`
(the mirror image), `footik-house-A-stair.png` (side, through the railing), `footik-ramp.png`.

Cost: +about 0.003 ms of CPU per ghost per frame (9 `groundAt` calls at ~0.3 us); no draw calls, triangles or network fields added.
Not checked: B and C stairs (same `CoreHouse` code as A), a physical phone.
