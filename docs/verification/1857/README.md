# #1857 — Astronaut

Scope: new cumulative positive jetpack-altitude counter and medal. Canonical before base `c8a0415984862f9703150aa0b19a22b63e90d11c`; runtime checkpoint `e3d84a2f`. Final runtime bytes are in [runtime.sha256](runtime.sha256). No geometry, terrain, ordinary movement parameters, jetpack thrust/heat/input, Room fields or network cadence changes. The later #1856 bicycle-only integration is unrelated to this vertical-physics hook.

## Counter and medal contract

`Player.update` emits actual positive vertical displacement after the jetpack physics/ceiling clamp, before lift snap/rescue. Main forwards it to `stats.jetpackMetres`. The counter keeps fractional metres in the existing per-player save; display and ordinary board export floor the accumulated value. Descent, a walking slope/step, an indoor pack, spawn, externally restored positions and reload never replay prior height. Coasting upward with a worn outdoor jetpack is still actual jetpack ascent. No new flight-time counter is introduced: the existing Jetpackpilot medal remains tied to take-offs (`jetpack`/`flights`).

Astronaut is new (`astronaut`), first 100 m **guess**, then existing cumulative1.5× curve: 100/250/475… Metres themselves give no event points. Existing medal receipts pay the ordinary bonus once per earned level and restore silently; the test also preserves a hypothetical pre-existing Astronaut receipt without paying it again. No destructive migration or new storage key. Existing two-second/pagehide save durability applies; unavailable storage cannot guarantee progress survives reload.

## Source-bound component checks

```
node --experimental-default-type=module --test tools/astronaut1857stats.mjs tools/astronaut1857test.mjs cloudflare/boards.test.mjs cloudflare/deploypaths.test.mjs
```

**17/17 pass**, [raw output](components.txt). Actual Player physics in an analytic empty outdoor volume is exercised at 20/60/120 Hz, with accumulated fractional displacement equal to actual ascent. These frequencies have the existing numerical integration differences; no per-frame rounding loss is introduced. Descent, unworn/indoor pack, ceiling, support step, spawn and restored-height cases yield no false altitude. Actual per-profile stats save/reload keeps fractions and old medal receipts/points. Catalogue/Worker checks cover flooring at sync, bounded 1200 m/min growth (18 m/s physical thin-air cap = 1080 m/min), initial allowance 100000 m (**guess**) and server-derived medal level. Existing boards regressions and Worker deploy-path coverage pass.

## Delivery and applicability

Minimal server-first stage: `src/boardcatalog.js` + `src/medalcatalog.js`; no new imported module/binding. Both already trigger `.github/workflows/cloud.yml`. Those shared files also feed the old frontend: publishing that intermediate Pages revision would reveal a locked Astronaut card before it can accrue new altitude. Hold intermediate Pages publication until Worker is green, then publish the complete Player/main/stats client. Existing counters/lists/IDs remain unchanged; local new progress remains saved even if an older Worker ignores the new counter.

Original-only gameplay/statistics/Cloudflare medal feature; no public port. Layout A/B/C/L sweeps are inapplicable: no geometry or indoor classification change. No physical-phone/FPS certification and no new whole-world/model matrix are claimed.

## Actual app input and result

One real `World`/main/Player/Jetpack/medal-dialog bootstrap at `http://localhost:8929/?test=lazy&cloud=&mp=0&jetpack&time=12&month=7&freeze&weather=clear`, Chromium/SwiftShader,1100×760,DPR1,hasTouch. `test=lazy` avoids unrelated warm-up; the scene is rendered at full test-mode quality for the image. A local clean profile starts with a deliberate98 m counter fixture just below the first threshold (not100 m flown during this run). Fixture spawn is x−120,z0 on the real2.724685 m terrain, pack equipped using the existing debug switch. The normal name dialog is skipped, normal menu hidden, renderer loop stopped, touch mode enabled. A **trusted native CDP touch** on the existing jetpack up button drives actual `Jetpack.lift` and `Player.update`,30 controlled50 ms steps. No synthetic call to the altitude callback or direct post-flight counter assignment.

[Raw input/height ledger](app/ascent.json): trusted touch down/up; up remains active in all30 steps. Feet2.724685→8.969685 m, actual ascent6.245 m; counter98→104.245 m (floating representation104.24499999999996). One ordinary take-off, Astronaut level1, ordinary medal bonus+10. The conventional dialog opens at104/250 metres for level2. [Inspected result image](app/astronaut-medal.png): Astronaut card/progress and actual world behind. All medal emoji are fallback boxes in this Linux font environment, including unchanged old cards; the Swedish labels/progress remain readable. No UI/font changes are made for this fixture limitation.

This is a controlled physical-trajectory/input proof, not a full live-frame performance benchmark or physical phone certification. The paused HUD frame value is not an FPS measure. No added meshes, geometry, textures, lights, draw calls or per-frame network fields: the patch adds one scalar callback and the existing stats/UI catalogue data. `cloud=&mp=0` keeps fixture gameplay out of production services. No production player rows/photos are used. No new browser matrix after these green source-bound checks.

Conductor integration: all accepted source-manifest entries remain exact except Player, whose only delta from the published bicycle class is the three reviewed altitude-hook lines. The entire bicycle behaviour remains intact. Merged entry-module syntax passed; source-bound17/17 and the inspected native app are reused without broad rerun. See integration-sources.json. Intermediate server-stage Pages is deliberately cancelled before deployment; only actual final client Pages and actual staged Worker will count as deployed verification.

Actual server-first release gate: Worker run41718591817 succeeded at server stage fadb26260acdf829f5950c7b559c1b8eef850e37, with Wrangler Deployed lunden-l1007 triggers before the client push. Intermediate Pages run41718591702 concluded cancelled and its deploy-pages step was skipped. It is deliberately not a deployment pass. Final client Pages and server-dependency parity follow below.
