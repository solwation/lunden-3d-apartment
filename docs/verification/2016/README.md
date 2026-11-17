# #2016 fingers close round held things

Close-ups from `tools/avatargrip.html` (`tools/browsertest.sh node tools/avatargripbrowser.cjs GAME OUT`, SwiftShader):
`*-side` / `*-above` close-ups of the right hand (cup-side: from the thumb side; empty-side: from the outer side; food-side: from the outer side, fingertips on both sides of the apple) with a cup (cylinder grip), a Nerf gun (pistol), a food item (pinch) and an empty hand (relaxed); `cup-below` the cup from below the fingertips;
`*-normal` at 2.2 m; `mirror-cup-side` our own mirror image; `preview-*` the customizer preview with each grip.
Checks: category/weapon to grip, smooth pick-up and release (monotone, no overshoot), no page errors. Draw calls unchanged (one skinned mesh per avatar), +268 triangles per avatar (style 0: 11852 to 12120, style 4: 17332 to 17600; tools/avatarheadtest.mjs budget passes), one continuous digit per finger (joint-centred segments).
