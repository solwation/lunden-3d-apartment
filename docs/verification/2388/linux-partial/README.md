# #2388 Linux partial result — issue remains open

Surface ForwardShading replaces translucency-volume lighting for the shared clear-glass master. The physical source parameters remain unchanged. The saved package was actually reloaded and checked. This is a verified improvement, not complete acceptance.

The three original frozen rectangles and ±15% luminance/saturation limits remain unchanged. Door ratios are Y **1.003**, S **0.872**; lower window **0.917 / 1.072**: both pass. Upper window **1.011 / 1.332**: **FAIL**. The four other views pass the unchanged 22-row numerical regression gate, including all fourteen material regions and existing hue guards. Whole originals were reviewed; unrelated visible gaps remain in the open issues listed in `review.json`.

The paired opacity-zero diagnostic uses its own web opacity-zero reference with the same three rectangles; it never replaces normal acceptance. Upper clear-vs-clear is **1.043 / 1.058** and passes, so the remaining upper discrepancy cannot be dismissed as an opaque background problem. Both engines' original bindings were restored; Native used a temporary MID on 35 receivers and saved no diagnostic material.

Actual recovery `20261127T180220879114-1503254`: native/runner/outer exit 0, 263.19 seconds. All 247 authored packages and the post-canonical Generated/export closure stayed exact and read-only. The successful save/reload/full-canonical prefix of the earlier failed harness run was explicitly reused; its overall failure remains recorded. See `prefix-reuse-proof.json` and `native-outcome.json`.

Raw frames are unchanged originals, 640×360, Linux CPU Vulkan/FXAA, conventional shadows and SeparateTranslucency. This provides neither Windows full-quality/performance nor rendered PIE-clock evidence. No web/public change applies to this original-only Unreal correction.

`glazing-gate.json`, `regression-gate.json`, `locked-acceptance.json`, and `review.json` retain the exact contracts, hashes, results and limitations. Work continues on matching source alpha/tonemap composition; do not close #2388 on this result.
