# #2207 ghostgaittest drew standing figures

Cause: #2004 (c370d766) made `Ghost.animate` derive the avatar's ground speed from the root's own travel between frames
(`motionFrame`), not from the `vx, vz` arguments. `tools/ghostgait.html` only passed velocities and never moved the root, so
every figure stood still (0 footfalls) and the test's footfall check (`if (s.footfalls && ...)`) skipped the comparison and printed PASS.

Fix: the page now moves the root by the velocity each frame (camera follows, ground enlarged, root/motion state reset per row);
the test fails when a moving row has 0 footfalls.

- `before/gait-sequence.png`: old page, standing figures. New test: `heard 0 / footfalls 0` x3, FAIL.
- `gait-sequence.png`: fixed page, walking/running/backing/strafing/mirror rows. Footfalls 19 / 23 / 23 (heard 19 / 24 / 23), PASS.
