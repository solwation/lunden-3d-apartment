# #2409 source bulb tone and point energy — accepted V6 evidence

V6 passes the original bulb-row/fence-pool luminance and warmth criteria and all22
apartment checks. Root reviewed all five original views. See the [final report](README.md)
for source14184, actual native exit0, incomplete/unknown runner and outer143 under#2473.
The source energy helper changes only two patio point IDs; source RGB, global2.8,
roughness, exposure settings, crops and acceptance tolerances remain unchanged.

The real source bulb is opaque `MeshBasicMaterial`, `toneMapped:false`. The export
now preserves that boolean from the actual material. Old/missing/true contracts
are rejected before building lighting. Existing bulb IDs and shared-MID values
`colour * (idle + boost*K*Supply)` are retained. The driver appends the same RGB to
MPC `PatioBulbLinear`; all earlier scalar/vector slots and GUIDs keep their order.

The candidate uses reserved stencil239 only on those components, `ERSM_Default`
whole-byte/depth-tested writes, and `r.CustomDepth=3`. The existing tone mapper
selects source RGB only if all of these conditions hold:

- The stencil identifies a source bulb and CustomDepth is positive and no farther
  than the main opaque SceneDepth, without a fitted depth epsilon.
- Scene and expected RGB are finite and View.PreExposure is positive.
- In all RGB channels, the reconstructed scene's exact half words equal
  either the source's RGBA16F words or its exact engine R11G11B10 packed/unpacked
  words. The expected value comes from the same driver colour as the shared MID.
  The engine's `PackR11G11B10F`/`UnpackR11G11B10F` are used directly, with no gain
  or numerical tolerance.

Opaque depths alone do not exclude composited glass or fog. A value outside both
exact storage representations retains Neutral. Stock materials cannot observe
which input format was selected, so this explicit union is bounded storage
equivalence rather than perfect pristine detection: an RGBA16F foreground
composite exactly equal to the source's R11 representation is indistinguishable
and can also select the exception. No claim of eliminating that ambiguity is made.
The source RGB bypasses both tone-mapping exposure and Neutral, then enters the
unchanged OETF. The alternative path retains the original Neutral/OETF expressions.
No CombinedBloom/PostProcessInput1 mask or global transparency correction is used.

The exact 5.8.4 HLSLMaterialTranslator.cpp 8239–8243 removes pre-exposure for the
ReplacingTonemapper SceneTexture input. Thus the branch receives raw Scene, before
the existing EyeAdaptation multiplication. Actual GPU confirmation of this clean
bulb equality, source input format and opaque self-depth comparison is mandatory.
The canonical test requires `r.SceneColorFormat=4` for base scene allocation and
CustomDepth mode3. That scene-format CVar does not force every postprocess
intermediate to remain RGBA16F; it is a base-scene guard.
If real self-pixels fail, no tolerance may be relaxed to force the exception on.
Behind transparent surfaces the conservative branch can remain disabled; it does
not claim full source per-material transparent composition parity.

The prior private V4 GPU observation had 178 stencil239 pixels, zero selected
pixels, and frontmost samples with reconstructed pre-exposed RGB exactly
`[0.248046875, 0.154296875, 0.0625]`, versus expected source RGB
`[1.460000038, 0.910982132, 0.371062040]` at PreExposure `0.1707550436258316`.
These are exactly the engine's R11 packed/unpacked source values. Its isolated
RGBA16F clean fixture and physical glass/fog/opaque-negative checks passed and
restored, but the original frame failed. The corrected two-representation selector
now has actual V5 GPU verification:172 original pixels selected, all four physical
fixtures and restoration pass. All22 apartment rows passed in V5, while its original bulb-row and fence-pool
visual gates still FAILED. V6 reuses the byte-exact selector HLSL and AST-identical
identity/MID/controller proof; it does not claim a fresh GPU/controller execution.
Its new five images pass both original patio fields and all22 apartment rows.
The failed V5 result remains preserved.

Exact Linux 5.8.4 source chain: `PostProcessing.cpp:459` chooses postprocess
SceneColorFormat from alpha propagation, independently of base scene format;
1065/1282 send it to translucency composition. `TranslucentRendering.cpp:838–846`
allocates that intermediate. `PostProcessing.cpp:1577,1591,1672` supplies the same
pre-tonemap slice to production Input0 and diagnostic Input2. `ScreenPass.cpp:73–76`
returns a 2D input without copying; its array-copy path retains format.
`Common.ush:11` includes `PackUnpack.ush`, whose254–268 implement half rounding
followed by mantissa-bit truncation. This is a real pre-tonemap storage change,
not an observer-only conversion or evidence of fog at those pixels.

`patio_tone.depth_users` checks exact exported IDs, a unique source driver, its
actual shared dynamic material and original unlit master, opaque blend, one slot,
main/depth rendering, whole-byte mask and stencil239. The existing #2372 inventory
still rejects every unknown CustomDepth user and still counts its original curtain
proxies. Adding opaque main-pass bulb depth does not change the existing cloth-AO
predicate: it already needs 0<t<=1, so t*SceneDepth<=SceneDepth<=bulbDepth; a closer
cloth remains the closest CustomDepth. Nonopaque/non-mainpass users are rejected.

Offline verification: `python3 tools/unreal-engine/tests/test_patio_tone.py` passes
four behavioural tests, including 733 actual selector-HLSL cases compiled as CPU
C++ with IEEE float32/float16 transport. Cases include several pre-exposures,
opaque self-pixels, wrong stencil/occlusion, fog mixtures and a one-half-storage-step
change. Additional regressions retain the measured original-view R11 tuple,
the clean RGBA16F path, strong transparent/fog mixtures on both paths, occlusion
and the explicitly documented format ambiguity. The actual reservation collector and actual wall-AO inventory are executed
with positive and negative IDs/MIDs/opaque/mask/foreign-user fixtures. Missing or
changed source tone contracts fail. Python/Node syntax and diff checks pass.
These offline checks do not substitute for the separate actual GPU and rendered
results in the final report.

The two exact literal patio point IDs now derive candela as
`sourceIntensity / 2**EXPOSURE_BIAS`: source1.4 becomes8.1988798973 cd with the
existing bias−2.55. This is a unit/exposure derivation, not a crop-ratio fit.
Every other light retains `CANDELA_PER_WEB=2.8`; missing patio contracts or unknown
patio IDs fail rather than silently extending this conversion. No new gain or
exposure setting was introduced. Colour, inverse-square mode, range and point
source radius/length remain unchanged.

At the locked June21 23:30 view, actual source exposure is1 and actual Native
EyeAdaptation is0.1707550436 (the float implementation of2**−2.55). Source
`PointLight.js:23` defines candela; `WebGLLights.js:358` uploads colour×intensity
without a legacy PI factor. `lights_pars_begin.glsl.js:56–69` applies inverse
metre² attenuation and the squared quartic range cutoff. UE5.8.4
`PointLightComponent.cpp:135` converts candela by10000 for centimetre²;
`CapsuleLightIntegrate.ush:27–28` applies the inverse squared distance. Thus the
fixed base exposure must be removed from the two literal point intensities to
preserve their exposed source energy at this measured night. The old room
calibration was for pooled room lights plus shader washes and is retained there.

This does not assert complete BRDF or all-distance identity: UE's capsule path
uses a1cm² distance bias (`DeferredLightingCommon.ush:309`), while Three clamps
inverse-square distance at0.01m². The CPU energy check includes both actual
regularizers and the common range window rather than fitting their difference.
It executes the actual builder row function and checks exact two-ID scope,
unchanged room conversion, measured-night normalization, and conditional algebra
for other exposure factors. It is not evidence of runtime transition exposures.

The sling's on/off thresholds are daylight0.3/0.4 (`config.js:6835`,
`patio.js:663–667`), so it can be active before inDay reaches0. Source exposure
blends linearly with clear; Native's source graph maps that factor to EV using
`expoW=ln(expo*ExpRatio)/ln(ExpRatio)`. The intended algebra matches the clear
factor, but actual dawn/dusk readback has not been verified here; the measured
night is the basis of this evidence. Actual V6 now passes the unchanged five-frame
patio/pool and apartment gates: bulb Y0.888563/R-B1.140513 and pool
Y0.995956/R-B0.975456, APT22/22. These results come from the rendered images,
not from the unit algebra or reused GPU-selector checks alone. The final report
keeps native0 distinct from the incomplete/unknown runner and outer143.

Original-only Unreal change. No public web/downstream transfer applies.
