# #519 — interactive entrance handle follow-up

The user reported on 2026-10-09 that the outer handle still disappears on the closed apartment entrance. Issue #519 was reopened: commit `82af6b7` fixed static neighbours' green-door hardware, while its geometry-only interactive checks enabled every ray layer and therefore missed runtime culling.

## Reproduction and fix

At noon, stand one metre outside the closed L1007 entrance, looking at the handle. The merged handle mesh is correctly placed, but DetailCuller sets its layer mask to **128 (hidden layer 7)**. Its merged bounding centre falls on/inside the apartment footprint; closed-door facade occlusion treats it as indoor contents. This is reproduced against commit `0f4e1e4`.

The existing `door.exterior` tag now exempts those door meshes from facade occlusion. Distance culling remains active, and the real door/walls still occlude hardware through normal WebGL depth testing. No geometry, materials, animations, interaction targets or collision dimensions change.

## Verification

- Extended `tools/entrancedoortest.html` with the actual culler, normal camera layers and real scene rendering. For closed/half-open/open states, both faces and front/oblique views, compare pixels with and without the hardware. Choose viewpoints within the opening: the wall physically obscures the inside handle from beyond the latch-side jamb.
- With the previous `detail.js`, the new test has **six failures**, precisely the three exterior views of the closed door (visibility plus rendered pixels). The former geometry checks still pass.
- With the correction, **55/55 entrance checks pass**, including panes, neighbours' hardware, opening/closing, moving collision, rendered handle pixels and retained distant/interior culling.
- `tools/detailtest.html`: **8/8 checks pass**, including hall-door visibility and 1,624 hidden details at the street start.
- Manually inspected actual before/after images from the same outside camera: missing handle before; visible silver handle after. Also inspected the closed door at 21:00 with lamps enabled.

Browser: Chrome for Testing 145.0.7632.6, Linux headless with SwiftShader. Screenshots remain session artifacts outside the repository. [Baseline](baseline.log), [entrance result](entrance.log), [detail result](detail.log).
