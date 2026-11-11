# Connected avatars and retained appearances (#1907)

Implementation base: `ebbf466b8b8dbfd463691ed9ad14805d6a853c31`.
The pre-migration reference is `2b077577b60410613bf4880be8eaf241e0ad7dc3`;
the faulty migration is `8de43671`. The reference is the existing detailed
`geometryFor(lk)` recipe and Olof IK, not a newly invented character. The function
is now exported as `avatarModelGeometry(lk)` for the offline exporter too.

## Cause and correction

The old exporter bound a detached hierarchy and used a different bone order from
the production `skinIndex` recipe. The result had displaced head/limbs. Its
replacement generic body also discarded clothing/hair variants and optional
accessory geometry, zeroed `armPump`, applied an unrelated texture atlas, and
recoloured geometry buffers shared by cloned avatars.

The exporter now uses the original detailed body/face source and the exact
production `attachSkeleton` hierarchy, attached before calculating inverse binds.
The standalone neutral asset omits shader-hidden accessory alternatives. Runtime
retains each look's complete original geometry, custom attributes, material and
private colour buffer. Gameplay uses the existing pose/IK authority, including
seats, drivers and tool targets; exported clips are for standalone inspection.
Late loading preserves retained mesh/bone references; a disposed avatar stays disposed.

The corrected neutral GLB is **5,150 triangles / 1,813,152 bytes**, versus the faulty **166,172 bytes**.
The six pictured production variants submit **10,790–15,710 triangles**, including
shader-hidden accessories, with one SkinnedMesh/draw each. This deliberately
restores the supported appearance rather than asserting that the broken generic
363-triangle shape is an acceptable budget. No startup, memory, mobile-device or
frame-rate improvement is claimed.

## Checks

1. `node --test tools/riggedavatartest.mjs tools/avatarcustomizertest.mjs tools/avatarbodytest.mjs tools/gympumptest.mjs`
   — **48/48 pass**. Actual committed GLB, every inverse-bound rest vertex within
   2e-6 of its source, exact bone order, all six clips at four phases with finite
   deformed bounds; five real hair/clothes/face variants with accessory/pump
   attributes and independent palettes; loaded-vs-original IK for movement,
   crouch, wave, dance, air and tool hands; retained Olof references and driving pose;
   existing appearance encoding/body/head/pump regressions.
2. `tools/browsertest.sh node tools/capture-avatar-production.cjs http://127.0.0.1:8191/tools/verify-avatar-rigged.html docs/verification/1907`
   — six actual production Avatar/IK poses, three full-figure views, zero page errors.
   [poses.json](poses.json) records actual deformed bounds and submitted triangles.
   Images were opened and visually reviewed: complete heads, faces, hands and feet;
   connected joints; distinct hair/clothing/accessories; credible crouch and seat contact.
   The gallery is the production component, **not the full World**.
3. `AVATAR_COMPONENT=1 tools/browsertest.sh node tools/avatarqualityapptest.cjs http://127.0.0.1:8191 http://localhost:8192 docs/verification/1907`
   — **pass**, actual customizer DOM/CSS, Ghosts, local Worker and reflection modules,
   with a controlled ground plane, player state and mirror plane. Actual UI choices
   reach the mirror avatar; a second real Ghosts client delivers a distinct look
   through the Worker, with independent palettes and complete posed bounds.
   [app-consumers.json](app-consumers.json) records the environment and result.
   `app-creator.png` shows the existing 2D creator, `app-mirror.png` its complete
   reflected 3D avatar, and `app-peer.png` the received complete 3D remote avatar.
   All three images were opened and visually reviewed; zero page errors. The mirror
   uses the existing 512-pixel render target, so its image is softer than the direct
   view. No mirror-quality change is claimed.

Full World **did not pass**: the first attempt reached a 150-second limit. A second
attempt with all models available exposed two geometry-attribute merge errors and
`Mesh.updateMorphTargets` receiving null; the exact source remains unproven. A
focused Pages-like fallback attempt found `src/santa.js`'s missing `hatGeometry`
before `window.__app` was exposed; `cheek` is missing too. This independent blocker
is tracked in **#1914**, not fixed in the avatar issue. The same app driver without
`AVATAR_COMPONENT=1` retains a bounded real-main reproduction for later acceptance.
These failures are not recorded as successful app checks.

Recorded logs are [Node results](node-tests.txt), [consumer results](consumer-test.txt)
and [the independent full-World blocker](full-world-blocker.txt).
[source-manifest.json](source-manifest.json) pins the asset, changed component/tools
and unchanged pose/customizer/ghost/reflection/config dependencies by SHA-256.

The gallery's front/side/oblique files are `avatar-front.png`, `avatar-side.png`
and `avatar-quarter.png`. They show idle, walk, run, crouch, 45-cm seat and wave,
with five hair styles and clothing/accessory differences. The green bounds label
explicitly requires separate visual review; it is not visual approval by itself.

## Integration and publication

Original-only personal characters/gameplay: no public port. No `stamp.sh` change
is included. #1913 owns deploying `models/` only after the other model corrections
are ready, and the final actual asset/version/deployment acceptance. #1914 must
also permit a successful combined full-app start. Local loading
does not establish Pages availability. The conductor must publish these images
with `Refs #1907`, embed permanent SHA-pinned URLs in the issue, then perform the
remaining publication acceptance before any closing commit. Existing before-images
remain available in the audit/history until the conductor's resolving commit.

Integration owner: `olw-win10-codex-20261111` (conductor `/root`). Checkout and exact
delivery revision are recorded in the issue handoff; worker does not push or close.
