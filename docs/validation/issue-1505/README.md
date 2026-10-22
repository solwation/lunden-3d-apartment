# Player head pitch — #1505

2026-10-22, follow-up to #1504. `look` now carries camera elevation outside sitting too;
existing seated yaw/pitch is preserved. Only original avatar/multiplayer gameplay applies,
so no public downstream transfer.

Minimum checks:

- `node --test --test-name-pattern='standing head pitch|seated look|rest posture' cloudflare/players.test.mjs`: 3 passed. Bounded pitch for ordinary/crouched/cycling states, late welcome, legacy omission/malformed angles; existing seated forwarding and pose transitions.
- `tools/seatedlooktest.cjs http://localhost:8770 http://localhost:8771 /tmp/headpitch1505-final`: passed, two real Chromium clients through local PlayerRoom using the production main.js state callback. Standing/walking/crouching/cycling up, down and neutral; mirror pitch agrees; ordinary and legs-up seated gaze/body anchors still pass; no page errors. [Raw results](result.json).
- Changed JS syntax checks and `git diff --check`: passed.

[Up](up.png) and [down](down.png) visually inspected. Bounded component renders, not a full World scene.
The first evidence camera was behind the standing avatar and the fixture bench crossed its legs;
corrected only the evidence camera/support visibility and reran the same focused check.
No broad combat, scene or platform sweeps.
