# #1859 — current bicycle component fixtures

Canonical base `fadb26260acdf829f5950c7b559c1b8eef850e37`, including published #1856 bicycle acceleration and the #1857 shared-catalogue server stage. Only `tools/mainfixture.cjs`, `tools/courtyardbicycletest.cjs`, `tools/bicycleterraintest.cjs` and verification documentation change. No application/runtime/config/Worker files change.

## Negative reproduction

[Saved original failure](before/source-bound-1856.txt), produced during #1856, ends with `ReferenceError: ducks is not defined` inside the verbatim production focus excerpt. The old fixture files and production `src/main.js` are **byte-identical** to this task's base; [before hashes](before/fixture.sha256). Thus the recorded failure is reused rather than spending another browser turn on the same broken bindings. The queued duplicate run was cancelled before acquiring the browser lock; [queue-only log](before/cancelled-duplicate-repro.txt). This is a fixture failure, not proof of a product bug.

Current focus additionally reads optional football targets and the outdoor-gym target array. The shared controlled-collaborator defaults now supply empty ducks targets, absent football, and empty gym targets. Richer fixtures still override these defaults. Actual bicycle models, Player, Touch, main E/action/stand/save handlers and ray selection remain real; no acceptance result or movement method is stubbed and exceptions are not swallowed.

## Acceleration versus geometry

The terrain probes previously assumed fixed 6 m/s from the first frame. They now start at established forward speed, or established reverse speed for the reverse ramp probe, so curb/stair/hull/ramp tests continue to exercise their intended geometry. The separate main-input section starts from rest with longer, explicit pedal intervals; touch-ramp relocation resets transient bicycle speed/air state so prior keyboard momentum cannot make the touch test pass.

The courtyard native input test records five actual speed/position samples on each of the five bicycles, with native keyboard on three and the real CDP touch joystick on two. It requires positive first speed below half cruising speed, strictly increasing speed, final speed above walking and below cruising, actual positive displacement smaller than an instant-cruise trajectory, and correct wheelbase support/hull. It does not use `bicycleSpeed` itself as an expected-value oracle. Existing exit, pause, save/resume, batch-ownership, bounds/normal, dynamic-door and ceiling checks remain.

## Verification and limits

Both commands use `PLAYWRIGHT_MODULE=/home/devcontainers/kvarteret-lunden/node_modules/playwright tools/browsertest.sh` and local `tools/devserve.py 8930`:

```
node tools/bicycleterraintest.cjs http://localhost:8930 docs/verification/1859/terrain
node tools/courtyardbicycletest.cjs http://localhost:8930 docs/verification/1859/input
```

These are renderer-free isolated browser components, no `World` bootstrap or physical-phone/FPS claim. The existing input fixture writes a plain DOM HUD screenshot as a temporary diagnostic; it is not retained as a product after-image. **Nonvisual exception:** the fix changes only test bindings/assertions, has no player-visible rendering or behaviour, and cannot meaningfully produce a new product result image. No player changelog entry is appropriate. Raw assertions/ledgers and source hashes provide the evidence instead.

This original gameplay test fixture has no equivalent bicycle gameplay in the public project, so no public port. No new Worker dependency/import/config, hence no Worker deployment required. A tools/docs change can still trigger Pages; conductor verifies the actual affected publication. No full campus/house-variant or application/model matrix is relevant.

## Final result

**Terrain 32/32 and courtyard input 90/90 pass**, no page errors or keep-save warnings, zero WebGL contexts. [Terrain output](terrain/output.txt), [actual terrain/main-input data](terrain/native.json), [input output](input/output.txt), [five-bike result](input/result.json). Each native input route measured speed 0.4298→0.8588→1.2868→1.7132→2.1375 m/s and 0.535728 m supported displacement over 0.5 s, confirming real acceleration rather than immediate 6 m/s. Three native keyboard routes and two real CDP joystick routes agree. Save/resume and ordinary free supported exit pass for every bicycle. The recorded CPU timing is diagnostic local component timing, not hardware/FPS acceptance. No more application or browser matrix is needed.
