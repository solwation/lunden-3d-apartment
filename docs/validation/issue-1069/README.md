# Two-point measurement (#1069)

Original base: `91d9c957` (detached ext4 worktree). Interaction reference:
`solwation/kvarteret-lunden@8aa0e642d25240affe274c8e4eb4410d3ba716e4`,
`src/main.js` (`setMeasure`, `measureAt`, `clearMeasurement`); reference file SHA-256
`024e32c4011e46a3bc5dcf0a00b7609f5b9e60ebb970d250e4586dc0db61572d`.
The public viewer already implements this interaction. This change adapts the
original application's input and HUD, so no new downstream import is applicable.
Public source was also reviewed at `34f27e704e0d82173cb0a93c561bd3d13002700d`.

Q or Mät avstånd toggles the mode. Two canvas picks select visible mesh surfaces;
locked mouse uses the crosshair, free touch/pen uses the tap position. A third
successful pick starts a new pair; misses preserve the last measurement. Leaving
measurement clears its geometry/HUD. Mode activation releases continuous weapon
and fuse-box input. Mouse actions, touch primary action and E/choice shortcuts
cannot use game objects while measuring. Navigation and camera drag remain.
The original Swedish distance and horizontal/vertical breakdown are retained;
the HUD explicitly calls these approximate model measurements. Targets now also
include the core and garage, matching the public viewer. Hidden ancestors and
invisible materials are excluded; visible glass remains measurable.

## Reproduce

Start `python3 tools/devserve.py 8168 .` in the checkout. Then:

```sh
export PLAYWRIGHT_MODULE=/home/devcontainers/kvarteret-lunden/node_modules/playwright
export CHROME_PATH=/home/devcontainers/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome
node tools/measurecomponenttest.cjs http://localhost:8168 /tmp/lunden-measure-1069/component-final
node tools/measureinputtest.cjs http://localhost:8168 /tmp/lunden-measure-1069/final
```

Chromium component: 10/10 checks, exit 0, no page exceptions. Actual index DOM/CSS,
Measure and WebGL render a bounded scene with explicit synthetic surfaces. Tests
cover hidden ancestors, visible glass, zero opacity, material arrays, nearest
surface, a known diagonal, axis read-outs, a miss and rendered markers/line.

Full original apartment: 24/24 checks, exit 0, no page exceptions, at 1280×720
and 844×390. Actual main.js input and World are loaded without module or service
substitution. Desktop obtains native `document.pointerLockElement === canvas`;
Playwright native mouse/key input measures living-room walls at 5.362 m (5.35 m
expected, 3 cm tolerance). Mobile uses actual touch entry, touchscreen taps and
CDP drag/cancel. Both modes verify two points, the new pair and exit, real freezer
unchanged during measurement and a real held rifle retaining ammunition. Desktop
also verifies E/right-click isolation and ordinary freezer use after exit.

Legacy `tools/measuretest.html`: 3/3, ALL PASS, exit 0; actual living-room walls
5.349 m and Swedish `5,35 m` label. Its old button-per-point API was updated to
toggle once and pick twice; this direct API regression is separate from native
input evidence above. Producer: `/tmp/legacy-measure-1069.cjs`; log `legacy.txt`.

Artifacts: `/tmp/lunden-measure-1069/`. `final/sources.json` freezes runtime and
input-driver SHA-256 values; `component-final/sources.json` freezes the component
inputs. Both full-app PNGs and the final component PNG were opened for inspection.
`final/*-network.json` records no page errors; only the missing local `data/todo.json`
request is aborted as the existing sample fallback takes over. Earlier run1/run2
failed the fixture's post-test cleanup because `goHome()` does not release the
held rifle. `putBack()` fixes the fixture; failed checks/images remain archived.
Run3 passed before the final marker-size/read-out refinements; `final/` reran all
checks on those final runtime bytes. No earlier failed result is counted as PASS.

Limits: full-app evidence uses `?test=lazy` (lowest graphics quality, no shadows,
one explicit actual WebGL draw for each screenshot). It does not certify ordinary
quality/warm-up, rendering performance, physical phone comfort, pen hardware or
all houses. The bounded component uses constructed surfaces; it is not the World.
`devserve.py` rewrites only the Three.js CDN import to its local pinned package;
no model/material module, including any ORM texture path, was replaced. No ORM
failure was observed in these runs. There is no production/Pages claim. Parent
reviews screenshots and integrates/publishes; changelog id 857 is provisional
and must be renumbered after its final rebase.

Parent review: desktop/mobile screenshots opened; all 247 recorded runtime/data/input-driver hashes match the integrated source exactly. A separate portrait attempt (390×844, temporary proportional-input driver `/tmp/measureportrait-1069.cjs`) was blocked at the native start button by the existing `#rotate` overlay, which requires landscape. It did not reach measurement and is not counted as passing portrait coverage; the original's verified mobile flow remains landscape. This intended orientation gate was not bypassed or changed.

Final parent integration rebased onto the independently published textile palette commit `79e7fb19`, preserving it and resolving only the shared changelog insertion. Measurement, main input, index DOM and input-driver bytes remain identical to the passing native run. Of the 247 recorded files, only `src/materialcatalog.js` (the other agent's palette) and `data/changelog.json` (both entries, measurement now 858) differ. The integrated actual WebGL component run also passes 10/10 with no browser exceptions (`/tmp/lunden-measure-1069/parent-component`). Changelog JSON and descending unique ids were validated; no conflict markers remain in delivered files.
