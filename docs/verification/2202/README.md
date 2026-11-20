# Mallard calls and shore sleep (#2202)

The existing four ducks and stable mixed pairs keep their territories, rendered-ground habitat, finite bread and reward paths.
`DUCK_LIFE` is an artistic set of guesses: fixed local-hour settling18–20 and waking05–07 (not a seasonal sunrise model),
quiet clock rate0.08, two shared duck-sound voices and additive tucked-neck sleep. Sound is synthesised, not recorded.
No new mesh, light, texture, renderer pass, persistent state or network field is introduced. The procedural failure fallback
gets the body rest but lacks rig neck bones; the GLB path is what the images verify.

## Source and checks

Baseline: `6965828e` (the exact source files used by the browser control are listed in `tools/ducklife2202browser.cjs`).
The implementation is the commit containing this record; `source.json` records tested source hashes.

- `node --test tools/ducklifetest.mjs tools/duckrangetest.mjs tools/duckkisstest.mjs tools/duckrewardtest.mjs`:
  night ramp, female/drake phrases, bounded sound slots, actual river surface contact, separated resting pairs, quiet sleep,
  bread/alert/morning precedence, distance freeze, retained pair leadership/kisses, bread portions and rewards.
- `node tools/ducktest.mjs` and `node tools/duckmotiontest.mjs`: retained swim/walk, finite bread, movement and wake/body-language contracts.
- One own before/after browser check through `tools/browsertest.sh`, two actual-app contexts for baseline/current source, followed by an after-only rerun for the corrected neck pose and camera,
  using `tools/ducklife2202browser.cjs` against this checkout on port8422; shared wrapper slot and installed full Chromium.
  Browser captures are1280×800 DPR1, quality3; logic uses the existing480×300 lazy test mode. Chromium/SwiftShader only,
  no physical-device/frame-rate or subjective sound-fidelity claim. The host has no systemd user scope, so the wrapper
  reports that no per-test memory ceiling was available (the shared slot lock still applies).

`node.txt` (11/11), `brain-node.txt`, `motion-node.txt` and final `browser.json` contain the results; `baseline-browser.json` retains the original-source control. All final checks passed with zero page errors. Four duck meshes remain1,312triangles each, with no added draw/light/pass; global scene counts differ by view and ambient actors. The final real audio entry points accepted two concurrent calls/wing phrases, rejected a third, and rejected a muted call. No older unrelated browser sweep ran.
The first browser attempt did not load a page because a temporary background HTTP server had exited; the same check was
restarted against a retained foreground server. This was a verification setup failure, not a product failure.

## Images and interpretation

- `dusk.png`: both birds have settled at the bank in the19:00 dusk schedule.
- `night-real.png`: the actual23:00 scene, deliberately dark; no lighting boost.
- `night-pair.png`: the same real asleep birds at23:00, with12:00 scene lighting temporarily retained for inspection.
- `before/night-pose-control.png`: matched effect-off control from that same app/camera, restoring the rig's rest transforms
  and removing only the sleep body offset; it is a controlled pose comparison, not a second original-code run.
- `morning-awake.png`: the same river after08:00 wake-up and return to ordinary movement.

The fixed test HUD still reads19:00 because these scoped duck steps update the production DayCycle and duck clock directly,
not the main HUD loop. `browser.json` records the actual23:00/08:00 state. The bright pose-control pair establishes the
sleep deformation, not midnight lighting; `night-real.png` supplies the true-night view. All images were opened and inspected.

The browser simulation uses real Ducks/DuckFlock, rig/mixer and rendered terrain, advancing local duck time in0.05s steps.
No duck position/pose is directly forced for the sleep check (only the explicitly marked effect-off control resets the pose). The observer is fixed at the first pair's riverbank;
all four ducks must finish on dry supported ground before the night check passes. Original/new scenes can differ in
unrelated random ambient actors; only the duck component geometry and state are claimed.

## Follow-up

The root conductor owns integration, SHA-pinned embedded image comments, deployment/Pages evidence and closure.
Before-images stay until those comments are published, then are removed in the resolving commit.
Public transfer is limited to the neutral visual schedule/rest behaviour if applicable to its existing ducks;
the public ambient-animal exception excludes duck audio, feeding/rewards and personal/game/service code.

Rerun reason: initial image review found raised necks and an unhelpful fixed baseline camera. The final pose lowers/translates the existing neck joint back toward the wing; affected after-only browser checks and the node checks were repeated, without a broader sweep.
