# #2228 — bicycle test follows acceleration, freewheel and pause

Base: `d65fb81a` (includes the #2222 key-handler source-anchor correction).
Changed implementation file: only `tools/bicycletest.cjs`; the interaction guide
is updated. No Player, config, motion, bike model/shader, input or save code changes.

## Diagnosis

The issue reported 104 PASS/12 FAIL. That is the reporter's baseline, not a
second full baseline run performed here. Current actual `bicycleSpeed` produces
2.1273 m in the first second from rest, while the old assertion demanded more
than 2.4 m (1.5 × walking speed) immediately. Longitudinal momentum is implemented
in `bikemotion.js`; #2148's ride state also represents cadence/freewheel. No
bisect attribution to that commit is claimed by this repair.

Releasing the pedal deliberately keeps moving with lower speed. The old first
pause assertion saved its position *before* a second of coasting and compared
that old position after pause. The production `active = () => !statsOpen &&
(locked || touch.enabled)` correctly prevents `player.update` when paused. The
old per-identity pause test already captured at pause time and did not fail.

The corrected test checks rest before pedalling, measures a 1.5 s acceleration
window against 1.5 × walking distance over the same time, verifies one 0.1 s coast,
and captures a fresh pose while still moving before pause. Pause now checks
exact position, all bike component matrices, speed, yaw and ride state. Each of
the nine identity probes uses the same acceleration duration; its real 0.2 rad
steer runs for 0.1 s so the longer drive plus steering stay within the previously
checked six-metre corridor. Steering/hull assertions are unchanged, not relaxed.

## Checks

1. `node --test tools/bikemotion1856test.mjs`: 2 PASS, 0 FAIL, about 0.12 s.
   Existing real momentum tests cover gradual acceleration/downhill growth,
   flat/uphill controls, bounded dt, coasting to rest and braking/reverse, plus
   takeoff/air-drag negatives. `diagnosis.json` adds 3 direct assertions showing
   the old one-second threshold fails, the 1.5-second threshold passes, and a
   released pedal decelerates without an instant stop.
2. `PLAYWRIGHT_MODULE=/home/devcontainers/kvarteret-lunden/node_modules/playwright tools/browsertest.sh node tools/bicycletest.cjs http://localhost:8433 docs/verification/2228/native`:
   **117 PASS, 0 FAIL, 0 page errors, 0 WebGL calls**, process exit 0. Approximately
   19 s (fixture directory creation through final result write). Full output in
   `native.txt`; runtime/source and excerpt hashes in `native/result.json`.
   All nine NW identities travel 4.7199 m in 1.5 s against a 3.6 m requirement.
   The first coast goes from 5.9368 to 5.6945 m/s while moving 0.5816 m. The
   subsequent pause leaves all checked state byte-identical (`native/coast-pause.json`).
   Mount/dismount, keyboard/mouse/native touch dispatch, collision/headroom/door,
   save/reload and eight untouched identities' exact component matrices pass.

`node --check tools/bicycletest.cjs` and `git diff --check` also pass. The source
was frozen during the native run; recorded SHA-256 values bind its actual modules,
main.js excerpt and test driver. No additional app/performance/browser sweep.

## Evidence and limitations

This is the existing Chromium DOM/source fixture with actual StreetLife/Player
and complete original input/save handlers, controlled world/focus/lock and touch
collaborators. It constructs no full World, renderer or app. It does not establish
pointer lock, physical phone, network rider pose, GPU/FPS or whole-app pause UI.
The wrapper reports no systemd user scope here, so no enforced memory ceiling is
claimed. There is no visual product change: screenshots cannot establish velocity
or a paused-state comparison, so numeric/log/source evidence is used instead of
new images. The existing driver automatically emitted four unchanged HUD-only
captures; all were opened and inspected at native aspect, then omitted because
the blue fixture background/unchanged controls do not evidence this speed/pause
repair. No extra capture or rendered scene was requested. No player changelog
is added for a test-only repair.

Public downstream: not applicable. The neutral public walkthrough excludes
rideable bicycle gameplay; this change only corrects the original gameplay test.
It contains no portable navigation/rendering/geometry implementation to transfer.
Equivalent houses: not applicable; the existing nine source identities are covered.

Phase timing (approximate): diagnosis/policy/plan 2 min, test edit/source review
1 min, Node + native verification under 25 s, docs/cleanup/handoff 2 min. All checks
pass within the scoped plan; no ten-minute reassessment or second run was needed.
Local server 8433 is stopped before handoff. Root retains integration/publication
ownership; no push/closure by this worker.
