# #2029 stair walking height = the treads, not a ramp (Hus A, B, C)

`CoreHouse.heights` (what `Player.groundAt` reads) now returns the tread top `Y + RISE x (floor(stairS) + 1)`, a step function, instead of the ramp line
`stairY` (half a riser above the nosings, +-9.4 cm from the drawn treads). The handrails keep `stairY`. The eye is smoothed by `Player.settleEye` as on Hus L's stair.

Numeric (node, `CoreHouse` built for CORE_A/B/C): every straight tread centre of both flights returns exactly its drawn tread top (worst deviation 0.0 m);
a 2 cm grid over the whole stair footprint (A 47 184, B 41 670, C 51 240 samples, winders and fans included; C's -1 lane too) has 0 points not on a tread top.
Old ramp vs tread: up to 9.4 cm apart.

Browser (`tools/avatarfootikbrowser.cjs`, ghost walking 1 m/s up and down the west flight, `footik.json`): stance foot over the ground under the ankle, max / mean (cm),
lowest sole (cm), eye trace at 1.4 m/s (`Player.settleEye`, largest eye move per 60 Hz frame / largest lag behind target, cm):

| Stair | stance max / mean | lowest sole | eye step / lag |
|---|---|---|---|
| Hus A | 6.3 / 0.7 | -7.5 | 4.7 / 15.4 |
| Hus B | 6.3 / 0.7 | -6.1 | 4.6 / 15.2 |
| Hus C | 6.3 / 0.7 | -4.3 | 4.6 / 15.0 |
| Hus L (unchanged, reference) | 6.8 / 0.6 | -1.7 | 4.9 / 16.2 |

Before (#2015, ramp line): Hus A 5.6 / 0.8, lowest sole -5.6. The mean stance error is the same; what changed is that the ground under the ankle is now the real tread
(the max / lowest-sole figures are dominated by the toe overhanging the next tread edge, not by the ground height). The eye moves like Hus L's.
Images: `footik-house-A-stair.png`, `footik-house-B-stair.png`, `footik-house-C-stair.png`.
