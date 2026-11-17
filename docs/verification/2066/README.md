# Continuous face profile and rounded chin — #2066

Source: `9075f309`, based on integrated `1a5b33ed` (including the completed eye-depth, eye-surface,
lip-volume, fine-skin and hair-gloss changes). Baseline and candidate use the same appearance code,
poses, cameras, lights and quality. The browser routes only the three changed source modules to their
baseline revision; all other assets stay identical. Chromium/SwiftShader, MSAA, NeutralToneMapping.

The two JPG sheets contain **before on the left, after on the right**:

- `contour.jpg`: daylight.
- `contour-backlight.jpg`: backlight, showing the silhouette and upward jaw edge.

Each side has four columns: front, three-quarter (0.75 rad), exact profile, low three-quarter.
Rows: light/medium/dark bare skin; full beard + moustache with cap and headphones; moustache with
brimmed hat; then all eight head-width/head-length/jaw slider corners. The eight corners are ordered
width 0 then 8, within each length 0 then 8, within each jaw 0 then 8. Thus every combination of the
three head-form extrema is rendered. These are the production Avatar geometry and uniforms, not a
separate illustrative mesh.

The chin is broader and rounder, the lower lip meets a recessed mentolabial groove, the upper lip has
subtle support, and the nasal root retreats between the eyes. The low lateral jaw turns upward toward
the ear. The beard follows the new skin rather than floating above it; cap/hat/headphones remain seated.
The eye-depth coordinates from #2063 are untouched. The existing nose and upper lip continue to use
the shared continuous skin surface.

## Checks and budget

1. **30 Node checks passed:**

   ```sh
   node --test tools/avatarprofiletest.mjs tools/avatarsculpttest.mjs tools/avatarlipstest.mjs \
     tools/avatarsockettest.mjs tools/avatarnosetest.mjs tools/avatarbeardtest.mjs \
     tools/avatarhittest.mjs tools/avatarexprtest.mjs
   ```

   Profile root/lip/groove/chin and lateral jaw masks, nose topology/slider limits, lip seam, socket depth,
   beard edges within 1 mm of the real skin and beard budget, kiss continuity, expression shader/state
   and ordinary head/body hit reaction checks pass. Expression/talk/kiss **browser animation sequences
   were not captured**; their relevant existing Node checks were used for this geometry-only change.

2. **Matched browser views:** 13 looks × four angles × daylight/backlight × two revisions; zero
   page/shader/console errors (`browser.json`). No world sweep was run. The saved paired sheets contain
   the original before views, so separate raw PNG/before files were not retained.

3. **Budget and focused timing:** unchanged triangles on every matched look: 15,660 without facial hair,
   16,624 with full beard/moustache, 15,860 with moustache; **15 bones and one draw** on the measured
   fixture. `timing.json` records the actual fixture metadata. No geometry, attribute, varying, texture,
   light or pass is added. Fragment/vertex shader work is unchanged: the four extra analytic profile
   forms and lateral jaw rise run only when building geometry on the CPU.

   The original `gl.finish()`-only submission timing in `browser.json` was implausibly small
   (0.085 → 0.0925 ms), so it is **not a GPU-frame claim**. A narrow timing-only probe added synchronous
   one-pixel readback after each render, verified a non-background head pixel, one draw and 15,660
   triangles. After eight warmups, 16 frames measured **72.05 → 76.69 ms** (+6.4%) under SwiftShader
   (`timing.json`). This includes readback/driver overhead on the shared host, not native GPU time,
   whole-game performance or physical-device evidence. No second image sweep was run for timing.

## Reproduction and scope

```sh
PLAYWRIGHT_MODULE=/home/olof/github-dashboard/node_modules/playwright \
  tools/browsertest.sh node tools/avatarprofile2066browser.cjs \
  http://localhost:8178 docs/verification/2066
# Targeted timing/fixture metadata only:
PLAYWRIGHT_MODULE=/home/olof/github-dashboard/node_modules/playwright \
  tools/browsertest.sh node tools/avatarprofile2066browser.cjs \
  http://localhost:8178 docs/verification/2066 both cost
```

No wire/appearance-code/slider range, rig, hitbox constant, remote-pose logic or LOD change.
There is no separate under-chin strap in this Avatar implementation; the existing diving-mask strap
is at eye height and its coordinates are unchanged. Cap, brimmed hat and headphones are shown.
Not separately tested: full-world mirror/preview route, physical devices and an underwater mask capture.
Avatar-only work is excluded from the public downstream.

Published on main as `7c9f8e8ef796c32505ecf9eccab056510e6cf8e2`; Pages44161330786 and Worker44161330784 passed. Both paired result images were embedded in the issue before closure.
