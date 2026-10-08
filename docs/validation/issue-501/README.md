# #501 – rearrangement controls and console

Playwright Chromium 1208/SwiftShader, Three.js 0.170.0, local devserve.

- rearrangeuitest: 16 checks cover the score-badge console hit area, physical Swedish §/Backquote and alternate key value, Enter remaining a submit key, selection/placement states, rotation, cancel retaining edit mode, Done discarding only the preview, paused menu, grouped reset confirmation and landscape scrolling.
- rearrangetest: all 28 existing placement, rotation, followers, collision and keyboard-exit checks pass.
- rearrangeresettest: all 17 original/all reset, cancellation, revision and saved-layout checks pass.
- touchtest: all 10 joystick, look, action/choice, number and plate controls checks pass.
- before.png / after.png / selected.png were reviewed at 844×390: console is inside the score badge, the toolbar has clear steps and no duplicate rotate button, and controls remain reachable. Baseline is an isolated worktree at 0fca798.

This changes UI and two guidance strings; placement geometry, footprints, collision and saving algorithms are unchanged.

real-input.txt records actual Playwright phone taps and desktop key presses with native canvas pointer lock: §/Backquote opens the console, ordinary Enter leaves it closed.
