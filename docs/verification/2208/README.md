# #2208 — planted soles on stair treads

Base: `f9658b58`. Scope is the shared avatar ground-support filter, not stair dimensions, collision, foot size, gait timing or the 5 cm acceptance threshold. Avatars/gameplay are absent from the public downstream, so this change does not apply there.

## Cause and change

At 60 Hz the former stance filter retains `0.18 × exp(-70 / 60) = 0.05605 m` of a rising 18 cm tread after its first frame. The real foot-bone/sole error matches that cached-height error for bodyBuild 0, 4 and 8; changing body width cannot correct it. `before-diagnosis.jsonl` records that correspondence.

A planted foot now bounds its filtered world support height by the current ground under its ankle. Swing and downward support keep their existing filters. No constants, tolerances, geometry, leg solver, materials, draw calls or audio budget change. A toe may still overhang a riser.

## Scoped checks

1. `PRINT=1 node --test tools/avatarfootiktest.mjs tools/avatargaittest.mjs`: **16/16 pass** (`node.txt`). The existing original stair test failed before (`before-node.txt`, 6/7 pass, 53.25 mm versus the existing 50 mm threshold). The stair regression now covers slim/medium/broad, ascending/descending. An additional contact transition checks that a swinging foot still eases up, reaches a higher tread immediately on replant, and eases down on lower support. Existing flat-floor, slope, unequal-height, downward reach and gait cases pass.
2. `node tools/avatarfoot2208diagnose.mjs`: six deterministic up/down/build cases (`before-diagnosis.jsonl`, `after-diagnosis.jsonl`). At fixed height the worst absolute stance error changes from 56.053 to 0.044 mm ascending; descending stays 0.112 mm.
3. Own Chromium/SwiftShader real-app check through `tools/browsertest.sh`, port 8428, exact served helper verified against checkout SHA256. Actual production `Avatar.update` and actual `Player.groundAt`, model loaded; identical 60 Hz routes, speed 0.9 m/s, look/height, build 0/4/8, ascent/descent and before/after code. Baseline Avatar imports are separately routed to the saved base helper, while all other code/assets are identical. No production source edits during live evidence. Numeric results: `browser.json`; image-only replay: `browser-images.json`. No page errors. This exercises the shared avatar consumer directly, not networking or self-mirror plumbing.

Worst signed stance sole gap (mm; negative means under the walkable support):

| Actual stair | Before | After | Builds |
| --- | ---: | ---: | --- |
| L / L1007 | −19.644 | −0.012 | 0, 4, 8 |
| A | −58.388 | −0.012 | 0, 4, 8 |
| B | −58.388 | −0.014 | 0, 4, 8 |
| C | −58.388 | −0.014 | 0, 4, 8 |

These numbers measure support from the player's collision/ground hook. They do not certify every drawn tread edge: A/B/C's stair support includes its established ramp line/landings. L's descending maximum positive gap remains 63.254 mm before/after in this short route (existing downward easing), outside this issue's sinking correction; no new landing planner is claimed. The synthetic test retains its original 5 cm acceptance threshold.

## Images and reproducibility

The worker's full-room app-camera attempts were inspected and rejected because walls/risers obscured the foot. No unusable PNG is committed. The conductor completed the image gate with an **isolated diagnostic view** of the production `Avatar.update`, `buildStairs` and `stairHeight`, using the same L/frame109/bodyBuild4 pose and separately routed baseline helper. This is not a screenshot of normal room lighting: the room is omitted, materials are neutral and diagnostic lights make the sole/step junction visible. Actual full-app A/B/C/L measurements above remain the integration evidence.

Both native900×600 images were opened and inspected. The before sole is cut into the tread; after its full white sole reaches the top surface. `isolated-browser.json` measures identical position/camera/ground0.8125m and sole0.7928556195→0.8124999973m (−19.644→approximately0mm). Both have25draws/17966triangles; this is only the diagnostic scene, not a full-app budget. No source edits during capture. `isolated-stair.png` and `before/isolated-stair.png` will be embedded at a pinned source revision before closure, then the before file removed.

```sh
PLAYWRIGHT_MODULE=/path/to/playwright tools/browsertest.sh node tools/avatarfoot2208view.cjs http://localhost:8438 docs/verification/2208 /tmp/2208-before-avatarfootik.js
```

Original full-app numeric reproduction:
```sh
python3 tools/devserve.py 8428 .
git show f9658b58:src/avatarfootik.js > /tmp/2208-before-avatarfootik.js
PLAYWRIGHT_MODULE=/path/to/playwright tools/browsertest.sh node tools/avatarfoot2208browser.cjs http://localhost:8428 docs/verification/2208 /tmp/2208-before-avatarfootik.js
```

`source.json` pins source hashes. The host has no systemd user scope: the wrapper's shared browser slot is active, but its per-process memory ceiling is unavailable. Node verification is about 2 seconds; the bounded app/three-build/four-stair pass and image corrections take a few minutes. No performance benchmark is claimed; the production change adds one comparison per contacting foot and no render/audio resources.

Rough phase times (UTC): policy/issue/diagnosis 14:47–14:49; implementation and Node 14:49–14:53; own real-app and bounded image diagnosis 14:53–15:03; documentation/checkpoint handoff 15:00–15:04. Integration owner: root conductor, session `olw-win10-gpt-6-20261120`; worker does not publish or close.

Published source `f691c2db351a6a9363fd4688b03a8fc813a79708`; pinned inspected before/after: https://github.com/solwation/lunden-3d-apartment/issues/2208#issuecomment-7042939228. Pages deployment succeeded. No Worker source/config changed, so no Worker deployment was triggered. Before image removed only after publication.
