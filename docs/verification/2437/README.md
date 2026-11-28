# #2437 — unaccepted source-material trials, 2026-11-28

The issue remains **OPEN**. No material, texture or runtime change from these trials is promoted to main.
The private source/asset checkpoint is `e958d4253e7506c041e707e5f7100c8455be7010` (source `f3cfe4e8`).
`candidate-source.patch` contains the reviewable source change against delivered `b7fb6125`, including its exact Canvas PNG;
it is an experiment, not a patch accepted for use. Source checkout `codex-2437-texture` retains the full checkpoint; actual candidate assets remain in private retained binary copies and the LFS store.

| Trial | Actual Native/runner/outer | Seconds | Grass R/G/B native ÷ web | Crown left/middle/right saturation ÷ web |
|---|---|---:|---|---|
| v1: procedural sRGB correction | 0/0/0 | 219.986 | 1.1303 / 1.0924 / 1.2986 | 0.8363 / 0.7931 / 1.0060 |
| v2: exact source Canvas + source front normals | 0/0/0 | 236.876 | 1.1015 / 1.0581 / 1.2640 | 0.8153 / 0.6328 / 0.9335 |
| v3: same v2 assets, actual SkyLight intensity 0 | 0/0/0 | 197.679 | identical to v2 | identical to v2 |

Original acceptance remains grass ±10% per channel and crown saturation ±15%. Both material candidates fail whole-issue
acceptance; v2 improves the lawn ratios but worsens two crowns. The source-correct normal change is therefore not promoted.
SkyLight=0 changed **0 of 230,400 decoded pixels in each view**. One PNG's encoded bytes differ, but its decoded RGB is exact.
That control supplies no evidence that SkyLight causes the remaining colour discrepancy. The native Ambient hemisphere cubemap
was deliberately unchanged (effective fill 1.0585000119); it and other lighting terms were not isolated by this trial.

The exact source Canvas trial uses actual `grassTexture()` texels, both source rotated/scaled lookups, source broad
brightness/blue-warmth patches, sRGB sampling and the verified `(u,1-v)` image convention. No source colour/gain was fitted.
Its normal texture build and all material checks passed. The leaf master cancels UE's back-face normal flip to match
`foliage.js` faceDirection=1; its saved graph and all three unchanged MIs passed normal vegetation material checks.
Four source Canvas/float32/fail-closed CPU checks, eight front/back normal cases with an old-path negative control and the
existing grass configuration check passed at their exact worker revisions. These source checks were reviewed and reused.

Original grass rectangle `[.62,.90,.70,.98]` is unchanged. The older crown evidence did not preserve its courtyard rectangles;
`crown-contract.json` explicitly defines three NEW representative leaf-interior rectangles, frozen from the old web image
before the meter saw Native. The historical leaf filter/HSL saturation method and original ±15% limit are unchanged.
The first grass meter retains its historical crown `UNASSESSED` field; `crowns.json` separately records the new mask measurements.
Neither is reported as a whole-issue pass.

Raw Native images are 640×360, source web references 1440×810, with the same aspect, vertical FOV72 and original cameras.
Both use 21 June 2026 at14:00, clear, lamps off. Old web references are reused only for unchanged static material crops;
`reference-reuse-check.json` records exact source/image hashes and the historical metadata limitations. No new browser scene,
world export, geometry or zone import was needed. Full images were reviewed; existing rendering differences remain unresolved.

V1 saved only Grass master; v2 saved exactly Grass master, new source texture and Foliage master, protecting the other245.
Normal checks and independent disk postflights passed; all248 authored assets were read-only after v2/v3, source/export/Generated
were byteexact, and clock/weather/lamps/season visibility/RTC/CVars were restored. V3 saved nothing and restored SkyLight intensity.
No new canonical20, global sync stamp, release gate, Shipping build or physical GPU/Windows result is claimed.

Next work must test a concrete remaining lighting/material hypothesis, for example independently isolating the Ambient cubemap,
without fitting RGB/gains or treating this SkyLight control as proof of a #2424 dependency. The published product remains b7fb6125.
The source/asset experiment is preserved for reuse; the current issue claim is released after posting these results.
These are original-only Unreal diagnostics; the web/downstream already use their source texture/normal rule and receive no change.
