# #2065 — rounded lips and philtrum

Source: `1ed4a51b0b5fbe45f0fa9a767bbd94f6469c4f83`, baseline `b78e0b64`.
Captured on 2026-11-17 with Chromium/SwiftShader through `tools/browsertest.sh`;
production `Avatar` on the isolated `avatarexpr.html` component fixture, port 8173.
The browser run completed before daemon recovery; its saved JSON and images were
inspected after recovery, without repeating the capture.

## Result

Every montage has the matched baseline on the left and the candidate on the right.

- `forms.png`: light, medium and dark skin, each in raking daylight then backlight;
  columns front, three-quarter and near-profile. The lower lip projects visibly from
  the profile and the upper lip has a Cupid's bow.
- `detail.png`: medium skin, raking light then backlight; front and three-quarter.
  The skin bridge has two raised philtrum columns; the vermilion rolls back into
  the skin and the dark seam remains behind the rounded lip surfaces.
- `expressions.png`: neutral, smile, surprise, grimace, talking and kiss, top to
  bottom. Each half has front/three-quarter without a beard and front/three-quarter
  with the full beard/moustache. No new mouth gap or beard penetration was observed.

## Checks

1. `node --test tools/avatarlipstest.mjs tools/avatarsculpttest.mjs tools/avatarheadtest.mjs tools/avatarexprtest.mjs`:
   **17/17 pass**, rechecked after daemon recovery. Includes lip/skin join and seam,
   rounded lower lip projection, outward faces, all beard jaw/pucker roles, skin
   border follow endpoints, finite geometry/weights and legacy hairstyle budgets.
2. `PLAYWRIGHT_MODULE=/home/olof/github-dashboard/node_modules/playwright tools/browsertest.sh node tools/avatarlips2065browser.cjs http://localhost:8173 docs/verification/2065`:
   **pass**, no page/shader/console errors in either phase; all images and
   `browser.json` came from that single matched run.
3. Read the combined production diff and inspect the three montages against #2065.
   `sealLipEdge` documentation now describes the parameterized last/first rows;
   the skin bridge follows the lip at its inner row and the muzzle at its outer row.

## Budget and limits

Triangles before/after: **15,620 / 15,620** for each of the three bare-face tones,
and **16,584 / 16,584** with the full beard. Reallocating the existing lip/border
rows from 3+1 to 2+2 adds **zero** triangles. The change adds no shader operations,
retained attributes, materials, draw calls, lights, passes, textures, rig bones or
network fields; the existing 15-bone single-mesh rig remains.

The same fixture inputs measured **1.9 ms before / 1.9 ms after** for the timed
contact-sheet batch (`__cost`, eight warmed iterations, 18 component views each).
This is a relative software-renderer measurement; it is not game-frame timing,
native-GPU/mobile performance evidence or a frame-rate guarantee.

This delivery is the lip geometry. Eye depth, ocular shading and fine skin are
separate sibling issues. The face's pre-existing pore marks and protruding eyes
remain in this source-bound baseline/candidate comparison. No full-world sweep,
physical-device test or downstream transfer applies: player avatars are original-only.

Integrated on main as `e347566c` / `c841bf42`, published with `93a06f25`; Pages 44159419315 and Worker 44159419233 passed. All three result images embedded in the issue before closure.
