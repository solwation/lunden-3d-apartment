# #2215 — comparable unhit control for the flinch test

Only the `tools/avatarhit.html` fixture changes. The production hit response, motion, breathing, consumers and existing `tools/avatarhittest.cjs` 2 mm threshold are unchanged. No player changelog is appropriate for a test fixture.

The old fixture created the hit and unhit Ghost twins separately. `Ghost.animate` initializes `avatar.breath` with `newBreath()`, whose default phase is `Math.random()`. Since #2108, breathing changes hips/torso and therefore crown position. Two unhit twins thus need not have the same resting crown, even though both are advanced at the same virtual time. A residual crown difference is not evidence that the flinch stayed active.

`phase-diagnosis.json` isolates this with actual production Avatar bones, the same look/time and no idle or hit: phases 0/0.5 give 3.9271976 mm crown separation; phases 0/0 give exactly zero. The fixture now initializes both controls with `newBreath(0)` and logs their final phases. It continues stepping the actual breathing animation, idle and hit consumers, without freezing the real production behavior or loosening the threshold.

## Scoped checks

- `node --test tools/avatarhittest.mjs`: 4/4 pass (`node.txt`), real Avatar directions, exact return, response, overlapping kicks, unchanged root/head boxes.
- `PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarhittest.cjs http://localhost:8435 docs/verification/2215`: existing actual Ghost/self component and native 1400×1080 contact sheets. Final result/measurements are in `browser.txt` and `hit.json`; source remains frozen during capture.
- `git diff --check` and fixture-source review. `source.json` binds the fixture and unchanged production consumer bytes.

The contact sheets illustrate the existing reaction, not a new visual effect in the game. Final browser: **PASS**, no page/console errors; all eight crown end distances round to **0.0000 m**, every hit effect is inactive, and each pair has identical logged breathing phases. Head peaks are 0.110–0.129 m; body peaks 0.102–0.226 m, with distinct front/side/back responses. Both native1400×1080 contact sheets were opened and inspected: the reaction unfolds and returns without changing the existing appearance. Chromium/SwiftShader only; no full-apartment/device/FPS assertion. Public downstream has no avatar/gameplay consumer, so no transfer is applicable.

Published source `676d12503c229035a79238f5b35c23b6a95e078b`; pinned native result images: https://github.com/solwation/lunden-3d-apartment/issues/2215#issuecomment-7043134293. Pages succeeded before closure; no Worker source/config changed.
