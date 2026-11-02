# #1800 - terrain step at z = 60 (x 140-195)

The terrain took Höje å's profile only south of z 60, which left a step of up to 2.25 m at z 60. It now eases out over `SITE.river.northFade` (16 m) north of z 60.

- `height-profile-z60.png`: `groundY` along z 44-70 at x = 135, 162.5 and 190, before (red, step at z 60) and after (green dashed). South of z 60 the curves coincide.
- `before-*` / `after-*`: same cameras, 13:00 on 20 September. The kink in the asphalt road is gone. The step itself sits behind the tree canopies in these views.
- Height diff x 130-210, z 44-70 (1749 samples): 877 changed, all at z < 60 (max 2.12 m); none at z >= 60. Step across z = 60 over x -300...340: before max 2.25 m, after under 2 cm.
