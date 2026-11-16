# Avatar head and hair — #2002

## Scope and budget locked before implementation

Baseline: `a05683d477d8705c912cd88b323ee21c555dcce6` (published body pass).
Replace floating lip ellipsoids with shaped, skin-seated lip bands; strengthen the
rounded chin/jaw transition, form an ear helix/concha and tapered brows, and give
hair a directional, grouped silhouette rather than a smooth cap. All work is
procedural original geometry. Existing identity, face controls, mouth/kiss weights,
head projection, headwear, glasses, beard and mask contracts remain in scope.
No body or movement edits, textures, extra lights, passes or per-frame geometry.

Five hairstyle baselines (no beard, identical seed/other inputs):

| Style | Triangles | Retained attribute bytes |
| --- | ---: | ---: |
| short | 11,172 | 3,586,212 |
| long | 11,940 | 3,832,740 |
| bun | 11,532 | 3,701,772 |
| beanie | 12,456 | 3,998,376 |
| curly | 16,092 | 5,165,532 |

Budget: at most **+10% triangles and retained attribute bytes per identical-input
variant**, one body draw and 15 bones. Keep the existing attribute layout and
semantic suitRole 0–4. No new texture allocation.

Three risk-based checks:
1. Matched near/profile/rear and meeting views, with an early profile/meeting art
   review before the final checks; actual AvatarPreview production consumer.
2. Relevant face extremes, speaking/kissing, beard and hair/headwear/accessories;
   existing posterior nose and mask/nose invariants; finite normals/weights and
   controls that still change their intended vertices.
3. Identical-input variant resources and bounded warm component render timings,
   with the same small viewport, lighting and software renderer. No hardware FPS
   or phone performance claim, and no full World bootstrap.

One owned bounded browser round; only concrete affected views may be refreshed.
Before images live under `before/` for publication/removal by the integrator.

## Result and source binding

The accepted geometry gives the mouth a Cupid's bow and joined skin border,
replaces solid ear lumps with a folded helix/concha, seats tapered brows against
the forehead, and broadens only the front chin sections. Directional scalp groups,
a swept hairline, smoother curls and a grouped/uneven long curtain replace the
more uniform cap contour. Root reviewed matched quarter/profile/meeting pairs at
the early gate and accepted the bounded long-hair correction before final checks.
The posterior head retains its authored ellipse and has zero nasal blend.

[Final verification manifest](verification.json) binds the final input hashes.
[Raw gallery, consumer and cost checkpoint](result.json) predates only the final
lip skin-band pucker correction. That checkpoint's speech fixture incorrectly
advanced `dt` without advancing the performance clock; it is not a production
speech failure. [The targeted follow-up](follow-up.json) injects time into the real
`mouthTarget`, then exercises real `update`/mouth uniforms: peak 0.934, ten
open/closed crossings, ending shut and no longer talking. Final kiss pixels are
in [mouth-kiss-final.png](mouth-kiss-final.png).

[Pucker attribute parity](pucker-reuse.json) records every attribute hash for all
five styles before/after that correction. Only `pucker` changed: the new skin-band
inner edge follows the lip and its outer edge follows the adjacent muzzle.
Positions, normals, palette/roles, skin weights, mouth weights and the other
attributes are byte-identical. All static and talking captures use `uKiss=0`, so
their geometry/pixels and the actual preview remain applicable to the final source.
The shader itself, textures, draw count and retained attribute sizes are unchanged.
No source hash on the older raw images has been silently replaced.

## Three checks completed

1. **Matched art and real consumer:** inspected baseline/current quarter,
   profile, back and normal meeting views using the loaded production rig with
   actual runtime geometry; short/long/curly heads and all five meeting styles.
   [actual-preview.png](actual-preview.png) uses the real `AvatarPreview` at its
   actual 220×310 size, including cap/specs/beard. Both previews compiled with one
   body draw, 15 bones and GL error 0. No World or multiplayer browser bootstrap.
2. **Contracts and relevant extremes:** [38/38 initial checks](reused-tests.txt)
   covered look codecs, face/hair/headwear/accessory options, production rig,
   posterior/nose and three geometry checks. After the pucker correction,
   [15/15 affected checks](affected-tests.txt) reran the eleven rig contracts and
   four head-specific resource/weight/lip/ear/pucker regressions; the unchanged
   customizer codec cases reuse the earlier run. Inspected six extreme/accessory
   combinations, all four beard choices with mouth closed/open and a final
   oblique kiss. Masked nose min/max are SHA-256 pixel-identical, bare nose
   min/max differ (positive control), all four cases one draw/GL error 0.
   Identity/palette/protocol fields and body/movement source are unchanged.
3. **Budget and warm cost:** same five input looks, camera/light and DPR1. No
   added retained attribute or image texture. All are one body draw, 15 bones.

| Style | Drawn triangles before → after | Attribute bytes before → after | Increase |
| --- | ---: | ---: | ---: |
| short | 11,212 → 11,700 | 3,599,052 → 3,755,700 | 4.35% |
| long | 11,940 → 12,428 | 3,832,740 → 3,989,388 | 4.09% |
| bun | 11,572 → 12,060 | 3,714,612 → 3,871,260 | 4.22% |
| beanie | 12,456 → 13,096 | 3,998,376 → 4,203,816 | 5.14% |
| curly | 16,132 → 17,012 | 5,178,372 → 5,460,852 | 5.45% |

The no-beard styles were measured in two fixture sleeve variants, explaining the
40-triangle difference from three entries of the budget-lock table above. Every
comparison uses identical before/after inputs. At 320×256, six warmups and twenty
samples, reported software `render + gl.finish` median/p95 were 0.10/0.30 ms for
both checkpoints. These near timer-resolution figures are browser/SwiftShader
command timings; they do not establish hardware GPU throughput or a speedup.
The final pucker-only change leaves geometry size, shader and pass costs identical
to the cost checkpoint. No runtime frame construction was introduced.

## Limits and review images

This remains an intentionally economical, stylized model, not GTA/RDR production
quality. Hair is still a coarse opaque mass; the existing long scalp/curtain normal
join remains visible from the back in both baseline and result. Beards/moustaches
retain their prior simple shells/blocks. Extreme hat/head combinations can exceed
the head-gallery crop; the production preview uses its own real framing. No full
World test, physical phone, hardware GPU measurement or every-option cross product
was run. Body/axilla LBS limits documented in #2001 remain unchanged.

Recommended publication pairs: `before/quarter.png` → `quarter.png`,
`before/profile.png` → `profile.png`, `before/meeting.png` → `meeting.png`.
`back.png` records the remaining join; `extremes.png`, `accessories.png`,
`mouth-open.png`, `mouth-kiss-final.png`, `suit-mask.png` and `actual-preview.png`
record the scoped consumer/control checks. All these images were opened and
inspected. Superseded kiss imagery was removed; every retained before image is
under `before/` for the integrator's pinned publication and cleanup.

Browser ownership was sequential: the closed-context art gate, a final component
pass, then only the corrected speech/pucker follow-up. No concurrent own browsers
or broad rerun. Owned browser/server processes were stopped after capture. Original
player avatars are not transferred to the public downstream project.

## Root integration

Rebased onto915104ef after the unrelated portrait-cache fix. All five final
checked source hashes still match verification.json; [integration.json](integration.json)
records parity and image hashes. Root reviewed code, matched art, final kiss,
back/baseline, extremes, accessories, suit and actual close-up preview. Existing
passing evidence is reused. The combined Ghost movement consumer is finalized
under #2004 after this geometry is published.
