# #2001 — connected body and clothing fit

Base: `3f7c3d0b1983bec2cde7fd44855c1c0af19744ba`. Original-only child of #2000.
The [scope/budget was posted before implementation](https://github.com/solwation/lunden-3d-apartment/issues/2001#issuecomment-6912785682).
Root owns integration/publication. The integration below combines the body with the subsequently published gait.

## Selected approach and locked budget

Replace the separate shoulder caps with one indexed torso/armhole/deltoid surface,
then split palette parts after shared normal generation. Five corresponding loops
join the actual oval armhole to a horizontal upper-arm section below its lower
edge. Positions, real skin weights and pump participation follow that connection.
The short sleeve ends below the connection; it remains a short-sleeve choice.
Independent ribcage width/depth, a lower neckline, one continuous hem and a curved
hoodie pocket replace stacked primitives. All existing bones/IK, body measurements,
colliders, looks, head/hair and animation code remain.

Fixed budget: one body draw, 15 bones, at most +10% drawn triangles and attribute
bytes at matched inputs. No new texture, light, render pass or per-frame geometry
build. `suitRole` costs one byte/vertex and is constant on each raster triangle;
0 blue limb, 1 torso, 2 head, 3 red limb, 4 hand. Both suit and skin colour use this
semantic role, rather than interpolated numerical bone labels. The role replaces
one bone-ID varying; it adds no separate shader variant or draw.

Early independent art reviews rejected angular/free-ring candidates. The final
connection follows actual endpoints and carries the upper arm down below the
armhole, avoiding its earlier backward fold. Only the final accepted geometry's
captures remain here. No AAA-equivalence claim.

## Three scoped checks

1. **Actual loaded Avatar imagery and consumer.** Matched baseline/current front,
   side, quarter and meeting captures for six fixed looks: 120/165/180/195 cm,
   slim/middle/broad, both body variants, T-shirt/long sleeve/sleeveless/hoodie,
   idle/walk/run/crouch/seat/high arm. The seat fixture accounts for body scale.
   A separate standing quarter pair and exposed cloth/bare axilla views establish
   that the new deltoid is rounded and the inspected high-arm surface is closed.
   The actual `AvatarPreview` renders at its real 220×310 size; no World bootstrap.
2. **Contracts and deformation.** [21/21 affected checks](affected-tests.txt)
   (rig, shared palettes, hand contacts, pump, joined shoulder attributes and
   normal guard), followed by [6/6 final semantic-role checks](hand-role-tests.txt).
   The prior [47/47 run](reused-tests.txt) also covers the 36 body/customizer checks
   whose paths are reused, not claimed as a new full-suite run. [Block parity](reuse-proof.json)
   records unchanged config outside `AVATAR_SURFACE`, hair recipe and Avatar runtime
   class. The old dominant-shoulder-only pump assertion was updated for the welded
   torso-dominant armhole while still requiring a real shoulder influence and
   its bounded location. The original pump maximum is retained.
3. **Local budget/cost.** [Raw component results](result.json) and [cold builds](build-cost.json).
   Every look retains one body draw and 15 bones. Three component-cached programs
   and six skeleton textures remain unchanged. No new image map. Actual counts:

| Look | Triangles before → after | Retained attribute bytes before → after |
|---|---|---|
| 1 | 11,444 → 11,212 | 3,639,192 → 3,599,052 |
| 2 | 12,172 → 11,940 | 3,870,696 → 3,832,740 |
| 3 | 12,012 → 11,728 | 3,819,816 → 3,764,688 |
| 4 | 12,896 → 12,612 | 4,100,928 → 4,048,452 |
| 5 | 16,364 → 16,132 | 5,203,752 → 5,178,372 |
| 6 | 11,404 → 11,172 | 3,626,472 → 3,586,212 |

Triangles decrease 1.4–2.4%; attribute bytes decrease 0.49–1.44%, including the new
role byte. Warm six-avatar CPU update (40 samples, per avatar) median
0.0133 → 0.0150 ms, p95 0.0183 → 0.0267 ms. Render+`gl.finish` at 320×256 median
0.30 → 0.30 ms, p95 0.50 → 0.70 ms. Cold variant builds (six, alternating order)
range 74.0–159.0 → 89.2–143.2 ms;
median 112.7 → 116.7 ms.
These are noisy shared-host Node/SwiftShader diagnostics, not hardware FPS or a
speedup claim. Timings precede the final semantic hand-tone amendment; geometry,
attribute bytes and suit classes are [exactly equivalent](hand-role-equivalence.json),
and the per-frame Avatar runtime is unchanged. No final-shader GPU timing claim.

## Final source binding and semantic colour correction

The final shader removes interpolated bone identity completely. A right bare
shoulder can no longer accidentally receive hand tone while its skin weights
cross torso→shoulder bone IDs. [Separate-context pixel proof](hand-role.json)
uses old v14 and final v15 keys: ordinary shoulder pixels differ, a forced hand-tone
positive control changes visible pixels, and suit pixels are identical. The six
look equivalence record checks every non-role attribute exactly and maps final
hand role4→red role3. No geometry or pose changed in this final amendment.

The body galleries, standing/axilla views and actual preview were genuinely
recaptured on the final shader. `result.json.finalShaderAmendment` maps those
images to final source and retains the earlier timing checkpoint hashes honestly.
The suit body/mask images reuse the preceding capture via exact suit-class and
shader-branch equivalence plus the matching pixel check. Its earlier nose test
still has different bare min/max pixels and identical suit min/max pixels, GL error0.
No mask/nose geometry or controls were changed. [Reconstructible shader amendment](hand-role.patch).
`source-manifest.json` records final file hashes and image provenance.

## Visual review and limits

Opened and reviewed: standing pair; all four whole/meeting galleries; both exposed
axilla views; real preview; suit body/mask; final bare right shoulder pair.
The whole shoulder now slopes into a rounded deltoid rather than a separate raised
cap. Sleeveless, seated, crouched and raised-arm figures keep the joined surface.
The figures remain stylized and the garment/inner-arm shading is still coarse.

The geometric-vs-skinned-normal guard is positive over bind/rest shoulder triangles
and the exposed front/back/outer surfaces of the sampled poses. It deliberately
**does not claim all posed triangles are normal-error-free**: the compressed inner
axilla still has an LBS normal discrepancy (the normal transform lacks the weight
field's derivative). This alone does not prove self-intersection. The targeted
high-arm images show the actual exposed surface; no DoubleSide or flipped-normal
workaround was used. Small inner compression creases remain a limitation.

The run hoodie/thigh intersection already exists in the matched baseline; this
step does not add clothing physics. No new hem-follow/pose scheme remains. Head,
hair, hands, legs and colliders retain their existing design. The live GLB rig
receives the new recipe geometry/material, so no neutral inspection GLB re-export
is needed. Static art and gait images use the base gait at 3f7c3d0b; parallel #2003
movement commits were not silently included. Integration owns any required combined
consumer/deformation check. No physical phone/Surface, hardware GPU benchmark,
mirror/Ghost networking bootstrap or broad World sweep was run.

## Reproduction and retention

With Three0.170.0 and Playwright available, serve this checkout on8801 and run
`tools/browsertest.sh node tools/avatarbodyart.cjs http://localhost:8801 --art-correction`
with `ART_REVIEW_GATE` pointing to a local decision file (`revise`/`accept`).
`node tools/avatarbodycost.mjs [outdir]` records isolated baseline/current cold variants (without `outdir` it writes to a temp directory, #2116; pass `docs/verification/2001` to refresh this record).
The final semantic correction harness uses the prior source reconstructed by
reversing `hand-role.patch` into `/tmp/2001-prior-avatar.js`; its public route is local only.
Initial rejected art attempts were stopped; only directly affected component views
were corrected. The final body capture and the semantic correction reused the same
bounded component, never a World/whole-performance rerun. All own browsers/servers
are stopped before handoff.

Before-images were published and embedded before closure, pinned to
[c6265d7c](https://github.com/solwation/lunden-3d-apartment/tree/c6265d7c649cdc12a7a0c8221e71028c35d55c51/docs/verification/2001/before).
They are removed from main in the resolving commit; pinned links remain. Final
images use normal verification retention.

## Combined integration on 5627ecb9

The focused [integration check](integration.json) loads the actual Avatar fixture
with #2003 and #2006 movement, advances walking/running at 1.6/4.8 m/s and
saves [the resulting six-look view](integration-gait-body.png). All six exact
triangle/attribute/bone/draw budgets match the body handoff; surfaces are finite
and GL/page errors are absent. [10/10 shoulder and gym checks](integration-tests.txt)
pass on this combination. The shoulder fixture now sets `cycles` as well as the
legacy `phase`, so the published gait actually exercises the intended stride.
The source hashes in integration.json bind this additional view; original image
and timing provenance above remains unchanged. No broad performance rerun.
