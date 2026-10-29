# Google Maps 3D views vs the game (2026-10-29)

The user's screenshots of Google Maps 3D (imagery ©2026 Google, Airbus, Maxar Technologies) of Sankt Lars, taken on
2026-10-29 as reference for making the surroundings more realistic. Kvarteret Lunden itself is still a building site in
the imagery and is not a reference. Each `google-*.png` has a `spel-*.png` rendered from the game at roughly the same
camera, for comparison.

Google URL camera: `@lat,lon,<alt>a,35y,<heading>h,<tilt>t`; lat/lon is the camera position and the view centre lies
about `alt · tan(tilt)` ahead along the heading. Game camera: `?at=x,z,yaw,pitch,feetY&shot&time=13&month=9&day=20&freeze&weather=clear`
with `x,z = geoToPlan(lon,lat)` (`src/sitegeo.js`), `yaw = 58 − heading` (`DAY.planNorth`), `pitch = −(90 − tilt)`,
`feetY ≈ alt`. The renders hid the cloud deck/fog and set a 35° field of view in the page only (no code change), and ran
in headless Chromium with CPU rendering. Matches are approximate: the altitude Google uses is not verified, so the game
views are often higher/wider. `spel-karpvagen-fran-oster.png` looks north-east over the campus instead of west and
should be retaken before it is used.

| View | Google camera | Game `at` |
|---|---|---|
| oversikt-fran-soder | 55.6796815,13.1792671,282a,351.7h,56.83t | 472.9,404.3,66.3,-33.2,280 |
| sjukhusomradet-fran-norr | 55.686202,13.178544,200a,200h,58t | -166.7,58.2,-142,-32,198 |
| lunden-campus-fran-sydvast | 55.682764,13.176833,220a,45h,58t | 101,352.1,13,-32,218 |
| fran-norr-over-lunden | 55.687881,13.180951,260a,190h,58t | -245.1,-169,-132,-32,258 |
| karpvagen-fran-oster | 55.686186,13.183893,180a,260h,60t | 12.7,-225.5,158,-30,178 |
| ostra-campus-fran-vaster | 55.684314,13.177907,180a,80h,60t | -9.6,203.5,-22,-30,178 |
| hoje-a-broarna-lagt | 55.683361,13.175832,90a,60h,70t | 11.3,370.1,-2,-20,88 |
| villorna-nattslandegatan | 55.680879,13.18177,150a,330h,60t | 443.1,200.5,88,-30,148 |
| hela-omradet-fran-soder | 55.678027,13.179,450a,0h,55t | 620.2,516.2,58,-35,448 |

These are visual references for proportions, colours, roof forms and vegetation. They do not supply dimensions:
heights, storeys and colours read from them remain *guesses* unless another source confirms them.
