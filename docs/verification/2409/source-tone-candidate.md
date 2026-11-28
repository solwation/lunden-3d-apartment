# #2409 source bulb tone exception — verified behavior, partial visual result

This implementation now has actual Linux GPU/controller and apartment evidence,
but the complete original #2409 visual criteria still FAIL. See the
[partial-delivery report](README.md) for actual results, process limitations and
remaining work. No intensity, candela conversion, RGB, roughness, crop or acceptance
tolerance was changed.

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
fixtures and restoration pass. All22 apartment rows pass, while the original
bulb-row and fence-pool visual gates still FAIL. The old run remains preserved.

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
three behavioural tests, including 733 actual selector-HLSL cases compiled as CPU
C++ with IEEE float32/float16 transport. Cases include several pre-exposures,
opaque self-pixels, wrong stencil/occlusion, fog mixtures and a one-half-storage-step
change. Additional regressions retain the measured original-view R11 tuple,
the clean RGBA16F path, strong transparent/fog mixtures on both paths, occlusion
and the explicitly documented format ambiguity. The actual reservation collector and actual wall-AO inventory are executed
with positive and negative IDs/MIDs/opaque/mask/foreign-user fixtures. Missing or
changed source tone contracts fail. Python/Node syntax and diff checks pass.
These offline checks do not substitute for the separate actual GPU and rendered
results in the partial-delivery report.

The two pool lights retain their existing source colour, intensity conversion and
range. Canonical checks now also require inverse-square falloff, source range and
zero area-light radius/length. Both engines use the same squared quartic cutoff.
The older 2.8 candela-per-web-unit assumption is retained; its unit/exposure chain
has not been independently validated here. The fence-pool outcome must still be
measured in the original view; a bulb correction cannot be called full #2409.

Original-only Unreal change. No public web/downstream transfer applies.
