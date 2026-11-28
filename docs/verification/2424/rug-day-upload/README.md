# Day-only MPC upload diagnostic — drawn response passes

The real Vulkan SM5 linux-low run completed in 210.46s with actual native/runner/outer **0/0/0**, no logged errors and two untouched 640×360 PNGs. The unchanged strict day crop now changes **1302/1302 decoded RGB pixels** between the original rug material and its saved source-ambient copy. This proves a drawn response, not source-colour or full-scene acceptance. The earlier failed day gate remains preserved in [rug-function-drawn](../rug-function-drawn/README.md).

The only intentional difference from that earlier day diagnostic is immediate MPC upload: transient `r.DeferUpdateRenderStates` changes **1→0→1**, with 0 set before the target world and MPC setters. The own `SourceDayShare` parameter is set **0→actual 1 with no draw between**, ensuring a changed CPU override before drawing. Final source values, function/math and gain are unchanged. The prior saved v2 function/master/MIC/MPC are reused: no API rebuild, function build, recompile or saved-asset write occurs in this run.

Both images intentionally have native SkyLight and Ambient cubemap intensity zero and the old window-light postprocess weight zero. Other materials therefore lack ambient light; these are isolated A/B controls, not proposed whole-room results. Only the rug component's material is transiently switched. The global source-ambient policy stays **OFF**.

All 247 authored packages remained byte-exact and read-only. All Generated files, both export trees and source/dependencies remained exact. The resolved original material and CVar were restored. The component override array changed from `[]` to `[None]`: fallback resolution is restored but exact array restoration is **false**. No world or asset was saved.

Source checkpoint `2c7d1efe2e6a901038a8d9aafa6d87127990be49` and native checkpoint `c4fb2986edccda814d97fa1d950e990074f28d0e` remain unpublished. This docs-only publication promotes no source or assets and makes no Windows, colour, whole-scene or whole-issue acceptance claim. #2424 remains open.

`capture.json` records the actual camera/MPC/material readbacks; its pending outcome fields are the capture-time state. `native-result.json`, `postflight.json` and `drawn-response.json` supply the subsequent actual process, disk and pixel results. `upload-cvar-finally.json` records CVar restoration and SDK provenance. `basic-shading.json` is a read-only material inventory, not a coverage or visual acceptance result. `raw-sha256.json` binds the unchanged evidence files, including both raw PNGs.

Refs #2424. Original Unreal diagnostic only; no public downstream transfer or player changelog applies.
