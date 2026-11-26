# #2463: no `poseOlof` crash when the outer layer rebuilds the body

Cause: `Ghost.animate` set `collectPose` on the old body and then called `updateOuter`, which can rebuild
`this.avatar` (outer layer on/off, including the customizer's `Ghost.outerPreview`). The new body posed
directly, `pendingPose` stayed undefined and `poseOlof(avatar, undefined)` threw
`Cannot destructure property 'hip' of 'undefined'` (two public crash reports, panel `avatar`).
Fix: `updateOuter` runs before the pose collection starts (`src/ghosts.js`).

Checks (WSL, Node 22, three 0.170.0 via a local `node_modules/three` link):

- `node --test tools/ghostposecollecttest.mjs`: fails with the reported TypeError before the fix
  (`poseOlof` ← `ghosts.js:651`), passes after; `tools/self2211test.mjs` and `tools/avatartrainerstest.mjs` pass.
- `tools/browsertest.sh node tools/avatarouterweargamebrowser.cjs` against this checkout: PASS with no page
  errors (customizer jacket/coat preview; own body mild → snow → doorway → indoors → rain).

Images (from that browser run): `customizer-jacket.png` the customizer with the jacket previewed;
`outdoors-snow.png` the own body outdoors in snow with the layer put on automatically.

Published with pinned images in the [completion comment](https://github.com/solwation/lunden-3d-apartment/issues/2463#issuecomment-7188940817).
