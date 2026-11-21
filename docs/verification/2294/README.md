# #2294 verification: mouse look direction and sensitivity

Unreal Editor 5.8.4, headless PIE, 2026-11-21. `test_player` forces a raw count of +1 per frame on MouseY, then on
MouseX (Enhanced Input `Input.+key`, which goes through `PlayerController.InputKey` like a mouse), and takes the
median per-frame change of the control rotation. The web turns `PLAYER.mouseSens` = 0.0013 rad = 0.0745° per pixel
(`src/main.js` `look`), mouse up looks up.

| Build | MouseY +1 → pitch | MouseX +1 → yaw |
|---|---|---|
| Before (origin/main `dd4b91a6`) | −0.0130° (looks down, 0.175 × the web) | +0.0130° (0.175 × the web) |
| Legacy input scales off only | +0.0052° (up, 0.07 × the web) | not measured |
| After (legacy scales off, mouse axis sensitivity 1) | +0.0745° | +0.0745° |

The −0.0130 is 0.0745 × (−2.5 legacy pitch scale) × 0.07 template mouse sensitivity. With the fix, `test_player`
passed in full (heights, speeds, jump, falls unchanged); `build_player.py --check` passed; `test_pilot_walker`,
`test_pilot_route` and `test_pilot_doors` passed. A real mouse on a visible window was not tested: one count from the
Windows mouse is taken to equal one browser pixel under pointer lock, which depends on the mouse and the Windows pointer
settings, as it does on the web.
