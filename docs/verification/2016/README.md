# #2016 fingers close round held things

Close-ups from `tools/avatargrip.html` (`tools/browsertest.sh node tools/avatargripbrowser.cjs GAME OUT`, SwiftShader):
`*-side` / `*-above` close-ups of the right hand with a cup (cylinder grip), a Nerf gun (pistol), a food item (pinch) and an empty hand (relaxed);
`*-normal` at 2.2 m; `mirror-cup-side` our own mirror image; `preview-*` the customizer preview with each grip.
Checks: category/weapon to grip, smooth pick-up and release (monotone, no overshoot), no page errors. Draw calls unchanged (one skinned mesh per avatar), about +320 triangles per avatar.
