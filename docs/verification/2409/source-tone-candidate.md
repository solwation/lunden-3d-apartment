# #2409 source bulb tone exception — candidate, not native acceptance

Source implementation only. No browser/export/GPU/native build or saved asset was
produced here. The published five-frame failure remains unchanged; the bulb and
fence-pool visual criteria, canonical `test_patio_strings` and apartment regressions
still require actual validation. No intensity, candela conversion, RGB, roughness,
crop or acceptance tolerance was changed.

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
- In all RGB channels, `f32tof16(Scene * View.PreExposure)` equals
  `f32tof16(Expected * View.PreExposure)` exactly. The expected value comes from
  the very same driver colour written to the actual shared MID.

This second condition is essential: opaque depths alone do not exclude already
composited glass, fog or other changes to Scene. A changed half-float storage value
even in one channel leaves the original Neutral result in place. Indistinguishable
values are bounded by actual RGBA16F storage precision, not a fitted RGB tolerance.
The source RGB bypasses both tone-mapping exposure and Neutral, then enters the
unchanged OETF. The alternative path retains the original Neutral/OETF expressions.
No CombinedBloom/PostProcessInput1 mask or global transparency correction is used.

The exact 5.8.4 HLSLMaterialTranslator.cpp 8239–8243 removes pre-exposure for the
ReplacingTonemapper SceneTexture input. Thus the branch receives raw Scene, before
the existing EyeAdaptation multiplication. Actual GPU confirmation of this clean
bulb equality, source input format and opaque self-depth comparison is mandatory.
The canonical test requires `r.SceneColorFormat=4` (RGBA16F) and CustomDepth mode3.
These are necessary source guards, not a claim that runtime readbacks passed.
If real self-pixels fail, no tolerance may be relaxed to force the exception on.
Behind transparent surfaces the conservative branch can remain disabled; it does
not claim full source per-material transparent composition parity.

`patio_tone.depth_users` checks exact exported IDs, a unique source driver, its
actual shared dynamic material and original unlit master, opaque blend, one slot,
main/depth rendering, whole-byte mask and stencil239. The existing #2372 inventory
still rejects every unknown CustomDepth user and still counts its original curtain
proxies. Adding opaque main-pass bulb depth does not change the existing cloth-AO
predicate: it already needs 0<t<=1, so t*SceneDepth<=SceneDepth<=bulbDepth; a closer
cloth remains the closest CustomDepth. Nonopaque/non-mainpass users are rejected.

Offline verification: `python3 tools/unreal-engine/tests/test_patio_tone.py` passes
three behavioural tests, including 700 actual selector-HLSL cases compiled as CPU
C++ with IEEE float32/float16 transport. Cases include several pre-exposures,
opaque self-pixels, wrong stencil/occlusion, fog mixtures and a one-half-storage-step
change. The actual reservation collector and actual wall-AO inventory are executed
with positive and negative IDs/MIDs/opaque/mask/foreign-user fixtures. Missing or
changed source tone contracts fail. Python/Node syntax and diff checks pass.
This is not a GPU shader compilation or actual rendered colour gate.

The two pool lights retain their existing source colour, intensity conversion and
range. Canonical checks now also require inverse-square falloff, source range and
zero area-light radius/length. Both engines use the same squared quartic cutoff.
The older 2.8 candela-per-web-unit assumption is retained; its unit/exposure chain
has not been independently validated here. The fence-pool outcome must still be
measured in the original view; a bulb correction cannot be called full #2409.

Original-only Unreal change. No public web/downstream transfer applies.
