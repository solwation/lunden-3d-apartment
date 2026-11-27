# #2369: stair brightness, four-view acceptance

Source work was already delivered in `27be8ee5` (28 source-derived stair light functions).
This closes its remaining current visual verification, using the delivered #2394 lighting foundation.

Actual readonly native run `20261127T134239088830-3773081`, source `2788460c`, production asset bytes `367c3969`:
exit0/completed/passed true,325.74 seconds. Outer launcher143 (#2473) is recorded separately; its interrupted
postflight was repeated manually and all247 authored packages are exact/read-only.
Canonical `build_lighting --check` passed and all28 saved PointLightComponent function bindings/disabled brightness1
were checked before and after actual clock/season settling. Initial LightFunctionQuality2; the explicit functional
fixture uses1, both enabled. No source/asset changes or private material substitutions in this verification.

Canonical `crop-stats.cjs ... --check-stairs` returned0. All four full-frame linear Rec709 luminance gates pass:

| View | Native/web |
|---|---:|
| Stairs22 |0.990|
| Living room14 |0.945|
| Living room22 |0.879|
| Upper floor22 |0.981|

The contract was fixed before the new stairs image. Three controls reuse the actual #2322 baseline originals,
run `20261127T132406160289-3293675` (native/outer0), identical cameras/date/lighting/viewport. The stairs image is new.
All four web originals use canonical scene/camera/lighting setup; fresh stairs and living22 have fully settled
source pools. The new web batch actually exited0. Raw640×360 images were never resized/retouched.

The full-frame criterion does not assert local contrast or colour equality: the diagnostic shaft crop is2.28×web,
tread1.76×web, and stairs R/B1.07 vsweb1.31. Local brightness/contrast remains open in #2480;
existing #2384 covers cool stair light. Furnishing/textiles/floor-/ceiling fields remain #2322; wall field #2372;
glass #2459 and emissive lamps/screens #2460. All whole frames were reviewed against their web counterparts.

Linux llvmpipe/Vulkan SM5, conventional1024 shadows/three cascades, SeparateTranslucency enabled, noLumen/Nanite/RT.
Actual AA method is1 (FXAA). Earlier AA0/off labels were inaccurate; requested scalability quality0 does not prove
AA disabled, and its actual quality value was not recorded. This note corrects the description, not the images.
No fullWindows/PIE/physics/collision/packaging acceptance is claimed. Static visibility uses native seasonal predicates.
Original Unreal-only: no public transfer or web changelog. Result images follow30-day retention; metadata remains.

[Published image comparison](https://github.com/solwation/lunden-3d-apartment/issues/2369#issuecomment-7220201320).
