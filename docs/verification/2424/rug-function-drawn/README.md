# One-rug source-function drawn diagnostic — NOT accepted

This isolated diagnostic changes one actual rug component from its original MIC chain to its own Generated copy. Both controls set the native SkyLight and Ambient cubemap to zero and disable the old window-light postprocess. Other materials therefore lack ambient light; the dark daytime room is an intentional control state, not a proposed full-scene result.

The source function must still produce an actual response on the rug. It does **not** in the locked day crop: 0/1302 decoded RGB pixels change. Evening changes 1302/1302. The cause of the absent day response is unknown; CPU MPC readback and graph checks do not prove the GPU uniform values or Custom-node output. The strict two-state response gate **FAILS**. These images do not establish source colour, global lighting, Windows or whole-issue acceptance. No gain, crop or tolerance was fitted.

The combined real Vulkan SM5 run completed in 272.97s with actual native/runner/outer 0/0/0 and no logged shader errors. The corrected first-build API preserved the original MIC overrides/PBR outputs, exercised same-context and changed-MPC reuse, saved and really reloaded its own packages. Explicit RecompileMaterial returned an empty error array. API/compile/native success is separate from the failed pixel gate.

All 247 authored packages remained exact and read-only. Previous Generated files, both export trees and pinned dependencies remained exact. Only the trial-owned SourceAmbientRugTrial/v2 files were saved, before drawing. The resolved original material was restored through SetMaterial; its empty override array became [None], so exact internal-array restoration is explicitly **false**. No world was saved. Global source-ambient policy remains disabled.

The source is local checkpoint 2c7d1efe2e6a901038a8d9aafa6d87127990be49, native checkpoint c4fb2986edccda814d97fa1d950e990074f28d0e. Both code checkpoints are still unpublished; this documentation commit promotes no implementation or asset. The cache fix changed only three optional asset-existence checks; emitted HLSL is byteidentical to the preceding candidate. The earlier API-only run had internal checks pass but actual native/runner/outer 1/1/1 because optional missing-cache loads emitted seven error records; it is not reused as a successful native run.

Read capture.json for the actual camera, source MPC readbacks and original/copy material paths; api-save-reload.json for the graph/override lifecycle; native-result.json and postflight.json for actual process and disk guards; pixel-response-failed.json for both unchanged locked crops. raw-sha256.json binds the four untouched original PNGs.

Refs #2424. Original Unreal diagnostic only; no public downstream transfer applies.
