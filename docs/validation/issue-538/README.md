# Portik containers (#538)

The user requested a 90° turn and placement against the long wall facing the apartment. PORTIK's open bay has its east interior face at x −11.37, with the unbroken wall extending from z 0.55 to 7.35. LIFE_WASTE.dropoff now derives the row centre as x −11.87, z 3.95, yaw −90°. This puts the fronts toward the west/open passage and the bin bodies 10 cm from the wall. Bin size/spacing and exact centring remain game assumptions; the Peab plan does not label a waste use here.

Before: centre (−12.95, 0, 1.2), yaw 0°, the row across the short north side. After: row along the east wall. Screenshots from the same entrance camera (−15.25,1.6,0.25), looking at (−12.2,1.2,3.95), show the short wall freed, front labels visible and a clear through passage. They remain in session scratch files `/tmp/lunden-538-before.png` and `/tmp/lunden-538-after.png`.

The existing buildDropoff transform already applies to bodies, lid hinges, pick targets, collision segments and obstacle polygon. No bin position is stored, so every normal reload and reset builds the same corrected geometry from config. The outline is x −12.30…−11.44, z 2.52…5.38; the central passage around x −15 stays clear.

Chromium/SwiftShader verification: portiktest checks both travel directions and the small room/stair approaches, actual meshes on the floor and clear of walls, front-side selection and bag disposal for all three categories, lid motion/clearance, and real page reload/full reset. life2test ?only=387 checks the complete tie/carry/dispose cycle, strict sorting/rewards, repeated bags and rotated collision. walktest covers the existing routes. All use the real builders/player/life logic.
