# #2227 – combat assertion uses the combat counter

Base `072f7908`; test-only change in `tools/combattest.cjs`. `Ghosts.shots` counts animal/shared outbox traffic as well as combat shots, so requiring its absolute value to be zero could fail without any combat shot or player damage. The assertion now snapshots `Combat.fired` immediately before the existing click and compares it after the existing 3-second settling window. The unchanged B.hurts condition still gates the assertion; the following hearts and B.seen checks and all later combat/damage steps are intact. No production source, gameplay, state or counters changed; no player changelog entry is applicable.

The frozen separate #2210 browser run was left untouched. Its earlier main-base run showed the initial false alarm while “no hearts without a fight” and “unarmed B is shown no shots” passed; the relevant existing log excerpt is saved here. The sibling worker could not collect a new live snapshot without modifying/restarting its run, so no additional browser profile or full three-app test was requested.

Two source-bound scenarios (`node docs/verification/2227/probe.mjs`):

1. The probe imports the real `Combat` and `Ghosts` modules and executes the exact updated assertion block from `combattest.cjs`. With no foes, real `Combat.fire('nerf')` returns without sending combat. A real `Ghosts.sendShot()` of an animal snapshot raises Ghosts.shots from 12 to 13 while Combat.fired stays at 7. The exact assertion passes; the former absolute-zero check would fail.
2. During the same assertion's settling window, a deliberately injected eligible foe allows real Nerf `Combat.fire` to emit one actual `t:'a'` packet. Combat.fired rises from 7 to 8, B.hurts remains zero, and the same assertion fails as required. This also verifies that a delayed outgoing combat shot cannot escape by being counted only synchronously at click time.

Both scenarios passed; `probe.txt` and `result.json` record the values/packets. `node --check tools/combattest.cjs` and `git diff --check` also passed. `source-freeze.json` binds the tested files.

Limits: this is Node with real production prototypes, a recorded WebSocket send, the actual foes guard and the real assertion callback. It does not construct a scene, app, Worker or DOM. The negative control injects a foe and supplies a no-candidate predictor so the real Nerf fire path dispatches a miss; it tests the counter/assertion, not geometry or damage validation. Browser-only module globals (`addEventListener` and empty location.search) are supplied; no personal storage/network is used. The fixture requires installed Three, reused locally through the ignored node_modules symlink to the existing home checkout. Production modules are unmodified.

No meaningful image exists for this internal test predicate; no visuals changed. Public downstream is not applicable: the public project excludes this original multiplayer combat gameplay/test. Root retains integration/publishing ownership; no push or closure by this worker. All local probe processes exit and no server/browser was started.

Approximate phases: reading/coordination/plan 1 minute, small assertion change 1 minute, targeted module-fixture setup/checks/evidence 2 minutes, handoff 1 minute.
