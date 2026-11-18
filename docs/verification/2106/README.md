# #2106 — avatar hands: nails, joint creases, knuckles, tendons

Before = baseline `d2b8884` (`src/avatar.js` and `src/config.js` served from that revision); after = the #2106 working tree on top of
it (`hands.json` records `source` as the checkout's HEAD at capture, i.e. the same baseline plus the uncommitted change). Both passes
use the same seeded `Math.random`, so the figures, rest curls and talking gesture match. Real `Ghost` figures (other players' path),
SwiftShader, 640 × 480 native tiles at half size in the sheets (before row above, after row below).

| Sheet | Shows |
|---|---|
| [fore-efter-rest.png](fore-efter-rest.png) | a free hand at rest (dark skin): nails with a paler edge on all five digits, creases at the joints, rounder tips |
| [fore-efter-cup.png](fore-efter-cup.png) | the cylinder grip round a cup: the tendons on the back of the hand show, knuckles rise |
| [fore-efter-nerf.png](fore-efter-nerf.png) | the pistol grip: the straight index finger keeps flat creases, the closed fingers' nails follow the curl |
| [fore-efter-talk.png](fore-efter-talk.png) | an open talking gesture: palm lighter with two soft creases, nails and the end-joint lines on the back |
| [body-talk.png](body-talk.png) / [before/body-talk.png](https://raw.githubusercontent.com/solwation/lunden-3d-apartment/af250a991a786c2458fa8a525d6290f97db68644/docs/verification/2106/before/body-talk.png) | game distance: the fine marks have faded out, nothing shimmers |

Checks: `node --test tools/avatarhandtest.mjs` (4 tests: deterministic and mirrored placement, nail/crease order on each finger,
nails following every grip shape rigidly with the shader's bend) plus the existing grip, talk, body, expression, self-view and lamp-wash
node tests; `tools/avatarhand2106browser.cjs`: zero page/shader errors in both passes, identical grip names and draw calls per view
(1 for the gesturing figure's close-up), matched frame times. Cost: no mesh, texture, draw call or network field; CPU per avatar 0.
SwiftShader frame time of a close-up where the hand fills the frame was 756 and 573 ms (after) against 628 and 794 ms (before) over two runs
on a heavily loaded shared host: within noise; no Surface measurement.

Limits: the hand keeps #2016's 5-sided finger capsules and the palm's coarse ellipsoid, so silhouettes stay low-poly; the marks are
shading only. The thumb's nail sits on the back of its stylised bend (away from the palm), not a real thumb's side-facing nail. The
mirror preview (#1994) and the avatar LOD (#1966) use the same material (not captured separately here); the far figure (`ghostfar.js`) has no hand detail.

Publicering: Pages/Worker success på `af250a9`; före-bilder borttagna vid stängning och visas från den commiten.
