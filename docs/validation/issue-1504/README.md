# Seated head direction — #1504

Sarah's original report and image: [#1504](https://github.com/solwation/lunden-3d-apartment/issues/1504).

Minimal verification, 2026-10-22:

- `node --test --test-name-pattern='seated look|rest posture' cloudflare/players.test.mjs`: 2 passed. Valid head angles reach observers and late joins; malformed/omitted angles clear; standing/lying cannot retain seated look.
- `tools/seatedlooktest.cjs http://localhost:8770 http://localhost:8771 /tmp/seated-look1504-final`: passed. Two real Chromium clients, production main.js state callback, real Rest/Ghosts/Avatar and local PlayerRoom. Both ordinary and legs-up sitting turn ±1.57 rad and look up/down; body, torso, hips and feet remain fixed; mirror agrees with peer; standing clears look. No page errors. [Raw results](result.json).
- Syntax checks and `git diff --check`: passed.

[Forward](forward.png) / [looking toward a neighbour](toward-neighbour.png) were visually inspected. These are bounded component renders, not a full World scene. First capture used the wrong side of the bench; corrected the evidence camera and repeated only this focused check. No broad rendering, combat or unrelated gameplay suites.

Only the original project's avatar/multiplayer gameplay applies; no public downstream transfer.
